import os from 'node:os';
import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { getCache } from '@vercel/functions';

let runtimeCache = null;
const roomWriteQueues = new Map();

const ROOM_TTL_SECONDS = 60 * 60 * 12;
const SSE_POLL_INTERVAL_MS = 1000;
const SSE_MAX_DURATION_MS = 25000;
const ROOM_ID_LENGTH = 10;
const PLAYERS = ['red', 'black'];
const CARD_RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const PLAYER_SUITS = { red: ['♥', '♦'], black: ['♠', '♣'] };
const BOARD_SIZE = 5;
const HAND_SIZE = 3;
const STORAGE_VERSION = 1;
const MATCH_LOG_VERSION = 'FLOOD_MATCH_LOG_V1';
const APP_MODE_SHARED = 'shared';

const encoder = new TextEncoder();

const clone = (value) => JSON.parse(JSON.stringify(value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const roomKey = (roomId) => `room:${roomId}`;
const roomTag = (roomId) => `room:${roomId}`;

const json = (payload, init = {}) => Response.json(payload, {
    status: init.status ?? 200,
    headers: {
        'Cache-Control': 'no-store',
        ...(init.headers ?? {})
    }
});

const errorResponse = (status, code, message, extra = {}) => json({
    ok: false,
    error: code,
    message,
    ...extra
}, { status });

const normalizeRoomId = (roomId) => {
    if (typeof roomId !== 'string') return null;
    const trimmed = roomId.trim().toLowerCase();
    return /^[a-z0-9]{8,16}$/.test(trimmed) ? trimmed : null;
};

const normalizeSeat = (seat) => (
    seat === 'red' || seat === 'black' ? seat : null
);

const getRuntimeCache = () => {
    runtimeCache ??= getCache({ namespace: 'flood-shared' });
    return runtimeCache;
};

const hashSeed = (seed) => {
    let hash = 2166136261;
    for (const char of String(seed)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const LOCAL_ROOM_STORE_PATH = path.join(os.tmpdir(), `flood-shared-${hashSeed(process.cwd() || 'local')}.json`);

const createSeededRandom = (seed = null) => {
    if (seed === null || seed === undefined || seed === '') {
        return Math.random;
    }
    let state = hashSeed(seed) || 1;
    return () => {
        state = (state + 0x6D2B79F5) | 0;
        let next = Math.imul(state ^ (state >>> 15), 1 | state);
        next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
};

const cardToCode = (card) => `${card.rank}${card.suit}`;

const createDeck = (player) => PLAYER_SUITS[player].flatMap((suit) => (
    CARD_RANKS.map((rank) => ({ rank, suit, color: player }))
));

const shuffleInPlace = (items, random = Math.random) => {
    for (let index = items.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
};

const createEmptyBoard = () => Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

const createOpeningHands = (decks) => {
    const hands = {
        red: Array(HAND_SIZE).fill(null),
        black: Array(HAND_SIZE).fill(null)
    };
    for (let round = 0; round < HAND_SIZE; round += 1) {
        PLAYERS.forEach((player) => {
            hands[player][round] = decks[player].pop() ?? null;
        });
    }
    return hands;
};

const createMatchLog = (fullDecks, seed) => ({
    format: MATCH_LOG_VERSION,
    meta: {
        createdAt: new Date().toISOString(),
        mode: APP_MODE_SHARED,
        seed,
        redSeat: 'host',
        blackSeat: 'invite'
    },
    shuffle: clone(fullDecks),
    events: [{
        n: 1,
        type: 'match-start',
        phase: 'setup',
        currentPlayer: 'red',
        detail: {
            shared: true
        }
    }]
});

const createInitialSharedGame = (seed) => {
    const random = createSeededRandom(seed);
    const fullDecks = {
        red: shuffleInPlace(createDeck('red'), random).map(cardToCode),
        black: shuffleInPlace(createDeck('black'), random).map(cardToCode)
    };
    const decks = clone(fullDecks);
    const hands = createOpeningHands(decks);
    return {
        version: STORAGE_VERSION,
        mode: APP_MODE_SHARED,
        seed,
        currentPlayer: 'red',
        gamePhase: 'setup',
        waitingForFlip: null,
        openingMoveComplete: false,
        setupWidePlacement: false,
        setupRevealed: {
            red: false,
            black: false
        },
        setupPlacements: {
            red: null,
            black: null
        },
        board: createEmptyBoard(),
        hands,
        decks,
        discards: {
            red: [],
            black: []
        },
        matchLog: createMatchLog(fullDecks, seed),
        matchLogStep: 1
    };
};

const getOrigin = (request, bodyOrigin = null) => {
    if (typeof bodyOrigin === 'string' && /^https?:\/\//.test(bodyOrigin)) {
        return bodyOrigin.replace(/\/$/, '');
    }
    const originHeader = request.headers.get('origin');
    if (originHeader) {
        return originHeader.replace(/\/$/, '');
    }
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') ?? 'https';
    if (host) {
        return `${protocol}://${host}`;
    }
    return 'https://floodgame.vercel.app';
};

const createInviteUrl = (origin, roomId) => `${origin}/?play=shared&room=${encodeURIComponent(roomId)}&seat=black`;

const toRoomStatus = (room) => {
    if (room.game?.gamePhase === 'ended') return 'ended';
    return room.players?.black?.joined ? 'active' : 'waiting';
};

const touchRoom = (room, { bumpVersion = false } = {}) => {
    const now = new Date().toISOString();
    room.updatedAt = now;
    room.expiresAt = new Date(Date.now() + (ROOM_TTL_SECONDS * 1000)).toISOString();
    room.status = toRoomStatus(room);
    if (bumpVersion) {
        room.version = Number(room.version ?? 0) + 1;
    }
    return room;
};

const sanitizeRoom = (room) => clone(room);

const shouldUseLocalStore = (request) => {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
};

const isRoomExpired = (room) => {
    const expiresAt = Date.parse(room?.expiresAt ?? '');
    return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
};

const readLocalStore = async () => {
    try {
        const raw = await readFile(LOCAL_ROOM_STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return {};
        }
        throw error;
    }
};

const writeLocalStore = async (rooms) => {
    await mkdir(path.dirname(LOCAL_ROOM_STORE_PATH), { recursive: true });
    const tempFile = `${LOCAL_ROOM_STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempFile, JSON.stringify(rooms), 'utf8');
    await rename(tempFile, LOCAL_ROOM_STORE_PATH);
};

const loadRoom = async (request, roomId) => {
    if (shouldUseLocalStore(request)) {
        const rooms = await readLocalStore();
        const room = rooms[roomId];
        if (!room || typeof room !== 'object') {
            return null;
        }
        if (isRoomExpired(room)) {
            delete rooms[roomId];
            await writeLocalStore(rooms);
            return null;
        }
        return room;
    }
    const room = await getRuntimeCache().get(roomKey(roomId));
    return room && typeof room === 'object' ? room : null;
};

const saveRoom = async (request, room) => {
    if (shouldUseLocalStore(request)) {
        const rooms = await readLocalStore();
        Object.entries(rooms).forEach(([storedRoomId, storedRoom]) => {
            if (!storedRoom || typeof storedRoom !== 'object' || isRoomExpired(storedRoom)) {
                delete rooms[storedRoomId];
            }
        });
        rooms[room.roomId] = clone(room);
        await writeLocalStore(rooms);
        return room;
    }
    await getRuntimeCache().set(roomKey(room.roomId), room, {
        ttl: ROOM_TTL_SECONDS,
        tags: [roomTag(room.roomId)],
        name: `Flood shared room ${room.roomId}`
    });
    return room;
};

const withRoomLock = async (roomId, work) => {
    const previous = roomWriteQueues.get(roomId) ?? Promise.resolve();
    let release = null;
    const current = new Promise((resolve) => {
        release = resolve;
    });
    const queued = previous.then(() => current, () => current);
    roomWriteQueues.set(roomId, queued);
    await previous.catch(() => {});
    try {
        return await work();
    } finally {
        release?.();
        if (roomWriteQueues.get(roomId) === queued) {
            roomWriteQueues.delete(roomId);
        }
    }
};

const createRoom = async (request, body) => {
    let roomId = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = crypto.randomUUID().replace(/-/g, '').slice(0, ROOM_ID_LENGTH);
        if (!await loadRoom(request, candidate)) {
            roomId = candidate;
            break;
        }
    }
    if (!roomId) {
        return errorResponse(503, 'room_create_failed', 'Unable to create a fresh room right now. Please try again.');
    }
    const origin = getOrigin(request, body?.origin);
    const now = new Date().toISOString();
    const seed = typeof body?.seed === 'string' && body.seed.trim() ? body.seed.trim() : `shared:${roomId}`;
    const room = {
        roomId,
        version: 1,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(Date.now() + (ROOM_TTL_SECONDS * 1000)).toISOString(),
        status: 'waiting',
        inviteUrl: createInviteUrl(origin, roomId),
        players: {
            red: {
                seat: 'red',
                joined: true,
                joinedAt: now,
                lastSeenAt: now
            },
            black: {
                seat: 'black',
                joined: false,
                joinedAt: null,
                lastSeenAt: null
            }
        },
        game: createInitialSharedGame(seed)
    };
    await saveRoom(request, room);
    return json({
        ok: true,
        seat: 'red',
        room: sanitizeRoom(room)
    }, { status: 201 });
};

const getRoomResponse = async (request, roomId) => {
    const room = await loadRoom(request, roomId);
    if (!room) {
        return errorResponse(404, 'room_not_found', 'That shared match could not be found.');
    }
    return json({
        ok: true,
        room: sanitizeRoom(room)
    });
};

const joinRoom = async (request, roomId, seat) => {
    const room = await loadRoom(request, roomId);
    if (!room) {
        return errorResponse(404, 'room_not_found', 'That shared match could not be found.');
    }
    if (seat !== 'black') {
        return errorResponse(400, 'seat_invalid', 'Only the invite seat can be joined from the shared link.');
    }
    const wasJoined = Boolean(room.players.black?.joined);
    room.players.black.joined = true;
    room.players.black.joinedAt = room.players.black.joinedAt ?? new Date().toISOString();
    room.players.black.lastSeenAt = new Date().toISOString();
    touchRoom(room, { bumpVersion: !wasJoined });
    await saveRoom(request, room);
    return json({
        ok: true,
        seat: 'black',
        room: sanitizeRoom(room)
    });
};

const isSeatTurn = (room, seat) => {
    if (!room?.game) return false;
    if (room.game.gamePhase === 'setup') {
        return true;
    }
    return room.game.currentPlayer === seat || room.game.waitingForFlip === seat;
};

const hasBothSetupRevealed = (game) => Boolean(
    game?.setupRevealed?.red && game?.setupRevealed?.black
);

const isResetSetupState = (game) => (
    game?.gamePhase === 'setup'
    && !game?.setupPlacements?.red
    && !game?.setupPlacements?.black
    && !game?.setupRevealed?.red
    && !game?.setupRevealed?.black
);

const clearSeatSetupPlacement = (game, seat) => {
    const placement = game?.setupPlacements?.[seat];
    if (!placement) return;
    const row = Number(placement.row);
    const col = Number(placement.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    const cell = game.board?.[row]?.[col];
    if (cell?.owner === seat) {
        game.board[row][col] = cell.covered ?? null;
    }
};

const createSeatSetupCell = (incomingGame, seat, placement) => {
    const row = Number(placement?.row);
    const col = Number(placement?.col);
    const incomingCell = incomingGame?.board?.[row]?.[col];
    if (incomingCell?.owner === seat) {
        return clone(incomingCell);
    }
    return {
        owner: seat,
        card: placement?.card ?? null,
        faceUp: Boolean(incomingGame?.setupRevealed?.[seat]),
        fromSlot: null,
        covered: null
    };
};

const mergeSetupState = (currentGame, incomingGame, seat) => {
    if (!currentGame || !incomingGame) {
        return null;
    }
    if (hasBothSetupRevealed(currentGame) && (incomingGame.gamePhase !== 'setup' || isResetSetupState(incomingGame))) {
        return clone(incomingGame);
    }
    const mergedGame = clone(currentGame);
    mergedGame.hands[seat] = clone(incomingGame.hands?.[seat] ?? mergedGame.hands?.[seat] ?? Array(HAND_SIZE).fill(null));
    mergedGame.decks[seat] = clone(incomingGame.decks?.[seat] ?? mergedGame.decks?.[seat] ?? []);
    mergedGame.discards[seat] = clone(incomingGame.discards?.[seat] ?? mergedGame.discards?.[seat] ?? []);
    clearSeatSetupPlacement(mergedGame, seat);
    const placement = clone(incomingGame.setupPlacements?.[seat] ?? null);
    mergedGame.setupPlacements[seat] = placement;
    mergedGame.setupRevealed[seat] = Boolean(incomingGame.setupRevealed?.[seat]);
    if (placement) {
        const row = Number(placement.row);
        const col = Number(placement.col);
        if (!Number.isInteger(row) || !Number.isInteger(col) || !mergedGame.board?.[row]) {
            return null;
        }
        mergedGame.board[row][col] = createSeatSetupCell(incomingGame, seat, placement);
    }
    mergedGame.waitingForFlip = null;
    return mergedGame;
};

const updateRoom = async (request, body) => {
    const roomId = normalizeRoomId(body?.roomId);
    const seat = normalizeSeat(body?.seat);
    const expectedVersion = Number(body?.expectedVersion);
    if (!roomId || !seat) {
        return errorResponse(400, 'room_invalid', 'A valid room id and seat are required.');
    }
    if (!Number.isFinite(expectedVersion)) {
        return errorResponse(400, 'version_invalid', 'An expected room version is required for synchronization.');
    }
    return withRoomLock(roomId, async () => {
        const room = await loadRoom(request, roomId);
        if (!room) {
            return errorResponse(404, 'room_not_found', 'That shared match could not be found.');
        }
        if (!room.players?.[seat]?.joined) {
            return errorResponse(409, 'seat_missing', 'That seat is not currently attached to this room.', {
                room: sanitizeRoom(room)
            });
        }
        if (!room.players.black?.joined) {
            return errorResponse(409, 'room_waiting', 'Your friend has not joined yet.', {
                room: sanitizeRoom(room)
            });
        }
        const isSetupSync = room.game?.gamePhase === 'setup' && body.game?.gamePhase !== 'ended';
        if (!isSetupSync && expectedVersion !== Number(room.version ?? 0)) {
            return errorResponse(409, 'room_conflict', 'The shared room moved on before this update arrived.', {
                room: sanitizeRoom(room)
            });
        }
        if (!isSetupSync && !isSeatTurn(room, seat)) {
            return errorResponse(409, 'turn_invalid', 'It is not this seat’s turn to update the room.', {
                room: sanitizeRoom(room)
            });
        }
        if (!body?.game || typeof body.game !== 'object') {
            return errorResponse(400, 'game_invalid', 'A serialized game snapshot is required.');
        }
        if (body.game.seed !== room.game.seed) {
            return errorResponse(400, 'seed_mismatch', 'The shared match seed does not match this room.');
        }
        room.game = isSetupSync ? mergeSetupState(room.game, body.game, seat) : clone(body.game);
        if (!room.game) {
            return errorResponse(409, 'setup_merge_invalid', 'The shared setup update could not be merged safely.', {
                room: sanitizeRoom(room)
            });
        }
        room.players[seat].lastSeenAt = new Date().toISOString();
        touchRoom(room, { bumpVersion: true });
        await saveRoom(request, room);
        return json({
            ok: true,
            room: sanitizeRoom(room)
        });
    });
};

const streamRoomEvents = async (request) => {
    const url = new URL(request.url);
    const roomId = normalizeRoomId(url.searchParams.get('room'));
    if (!roomId) {
        return errorResponse(400, 'room_invalid', 'A valid room id is required.');
    }
    const initialRoom = await loadRoom(request, roomId);
    if (!initialRoom) {
        return errorResponse(404, 'room_not_found', 'That shared match could not be found.');
    }
    let lastVersion = Number(url.searchParams.get('since') ?? 0);
    const stream = new ReadableStream({
        start(controller) {
            let closed = false;
            const sendEvent = (eventName, payload) => {
                controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
            };
            const sendComment = (message) => {
                controller.enqueue(encoder.encode(`: ${message}\n\n`));
            };
            const close = () => {
                if (closed) return;
                closed = true;
                try {
                    controller.close();
                } catch (error) {
                    // no-op: the stream is already closed
                }
            };
            const loop = async () => {
                sendComment('connected');
                const deadline = Date.now() + SSE_MAX_DURATION_MS;
                while (!closed && Date.now() < deadline) {
                    const room = await loadRoom(request, roomId);
                    if (!room) {
                        sendEvent('room-missing', { roomId });
                        break;
                    }
                    const roomVersion = Number(room.version ?? 0);
                    if (roomVersion > lastVersion) {
                        lastVersion = roomVersion;
                        sendEvent('room', sanitizeRoom(room));
                    } else {
                        sendComment('keepalive');
                    }
                    await sleep(SSE_POLL_INTERVAL_MS);
                }
                close();
            };
            loop().catch((error) => {
                try {
                    sendEvent('error', {
                        message: error?.message ?? 'Room stream failed.'
                    });
                } finally {
                    close();
                }
            });
            request.signal.addEventListener('abort', close, { once: true });
        }
    });
    return new Response(stream, {
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Connection': 'keep-alive',
            'Content-Type': 'text/event-stream; charset=utf-8',
            'X-Accel-Buffering': 'no'
        }
    });
};

const parseBody = async (request) => {
    try {
        return await request.json();
    } catch (error) {
        return {};
    }
};

export async function GET(request) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') ?? 'room';
    if (action === 'events') {
        return streamRoomEvents(request);
    }
    if (action !== 'room') {
        return errorResponse(400, 'action_invalid', 'Unsupported multiplayer action.');
    }
    const roomId = normalizeRoomId(url.searchParams.get('room'));
    if (!roomId) {
        return errorResponse(400, 'room_invalid', 'A valid room id is required.');
    }
    return getRoomResponse(request, roomId);
}

export async function POST(request) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const body = await parseBody(request);
    if (action === 'create') {
        return createRoom(request, body);
    }
    if (action === 'join') {
        const roomId = normalizeRoomId(body?.roomId);
        const seat = normalizeSeat(body?.seat) ?? 'black';
        if (!roomId) {
            return errorResponse(400, 'room_invalid', 'A valid room id is required.');
        }
        return joinRoom(request, roomId, seat);
    }
    if (action === 'update') {
        return updateRoom(request, body);
    }
    return errorResponse(400, 'action_invalid', 'Unsupported multiplayer action.');
}
