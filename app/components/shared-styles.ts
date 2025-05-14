const baseStyles = {
    border: '2px solid #444',
    borderRadius: '10px',
    boxShadow: '0 2px 8px #0004',
    aspectRatio: '7 / 10',
    boxSizing: 'border-box' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    cursor: 'pointer',
    userSelect: 'none' as const,
    transition: 'transform 0.2s ease-in-out',
    '&:hover': {
        transform: 'translateY(-2px)',
    },
} as const;

export const cardStyles = {
    ...baseStyles,
    background: '#fff',
} as const;

export const cellStyles = {
    ...baseStyles,
    background: '#222',
} as const; 