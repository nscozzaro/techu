require('@testing-library/jest-dom');

// Polyfill PointerEvent for JSDOM (assign only writable props)
global.PointerEvent = global.PointerEvent || function PointerEvent(type, props) {
    const event = document.createEvent('Event');
    event.initEvent(type, true, true);
    if (props) {
        for (const key in props) {
            try {
                event[key] = props[key];
            } catch (e) { }
        }
    }
    return event;
};

// Mock document.elementFromPoint for drag-and-drop tests
beforeAll(() => {
    document.elementFromPoint = document.elementFromPoint || jest.fn(() => {
        // Return a div with a data-cell attribute for testing
        const el = document.createElement('div');
        el.setAttribute('data-cell', '1');
        return el;
    });
}); 