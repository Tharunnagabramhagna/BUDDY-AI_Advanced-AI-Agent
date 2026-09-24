import React, { useCallback, useEffect, useState } from 'react';

/**
 * TitleBar — Pure window shell component.
 *
 * Renders ONLY the native-style OS window chrome:
 *   - Draggable title region (doubles as double-click to maximize)
 *   - Minimize, Maximize/Restore, Close buttons
 *
 * All application-level controls (branding, sidebar, settings, model badge)
 * belong in the BuddyHeader component below this shell.
 */
export const TitleBar = React.memo(() => {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        let mounted = true;
        if (window.electronAPI && typeof window.electronAPI.isWindowMaximized === 'function') {
            window.electronAPI.isWindowMaximized().then(max => {
                if (mounted) setIsMaximized(Boolean(max));
            }).catch(() => {});
        }
        if (window.electronAPI && typeof window.electronAPI.onWindowMaximizeChange === 'function') {
            const cleanup = window.electronAPI.onWindowMaximizeChange((max) => {
                if (mounted) setIsMaximized(Boolean(max));
            });
            return () => {
                mounted = false;
                if (typeof cleanup === 'function') cleanup();
            };
        }
        return () => { mounted = false; };
    }, []);

    const handleClose = useCallback(() => {
        if (window.electronAPI && typeof window.electronAPI.closeApp === 'function') {
            window.electronAPI.closeApp();
        }
    }, []);

    const handleMinimize = useCallback(() => {
        if (window.electronAPI && typeof window.electronAPI.minimizeWindow === 'function') {
            window.electronAPI.minimizeWindow();
        }
    }, []);

    const handleMaximize = useCallback(() => {
        if (window.electronAPI && typeof window.electronAPI.toggleMaximizeWindow === 'function') {
            window.electronAPI.toggleMaximizeWindow();
        }
    }, []);

    return (
        <div
            className="buddy-window-shell"
            onDoubleClick={handleMaximize}
            style={{
                width: '100%',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                background: 'var(--win-surface, #0a0c14)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                WebkitAppRegion: 'drag',
                userSelect: 'none',
                fontFamily: 'var(--win-font-family, Segoe UI, sans-serif)',
                boxSizing: 'border-box',
                flexShrink: 0
            }}
        >
            {/* Window controls — right-aligned, matching native Windows chrome */}
            <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag', height: '100%' }}>
                {/* Minimize */}
                <button
                    onClick={handleMinimize}
                    title="Minimize"
                    aria-label="Minimize"
                    style={{
                        width: '46px',
                        height: '100%',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 120ms ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    <svg width="10" height="1" viewBox="0 0 10 1">
                        <line x1="0" y1="0.5" x2="10" y2="0.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
                    </svg>
                </button>

                {/* Maximize / Restore */}
                <button
                    onClick={handleMaximize}
                    title={isMaximized ? "Restore" : "Maximize"}
                    aria-label={isMaximized ? "Restore" : "Maximize"}
                    style={{
                        width: '46px',
                        height: '100%',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 120ms ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    {isMaximized ? (
                        <svg width="10" height="10" viewBox="0 0 10 10">
                            <path d="M2.5 2.5V0.5H9.5V7.5H7.5" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
                            <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
                        </svg>
                    ) : (
                        <svg width="10" height="10" viewBox="0 0 10 10">
                            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
                        </svg>
                    )}
                </button>

                {/* Close */}
                <button
                    onClick={handleClose}
                    title="Close"
                    aria-label="Close"
                    style={{
                        width: '46px',
                        height: '100%',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 120ms ease, color 120ms ease'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = '#e81123';
                        const svgPath = e.currentTarget.querySelector('path');
                        if (svgPath) svgPath.setAttribute('stroke', '#ffffff');
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                        const svgPath = e.currentTarget.querySelector('path');
                        if (svgPath) svgPath.setAttribute('stroke', 'rgba(255,255,255,0.7)');
                    }}
                >
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <path d="M1 1 L9 9 M9 1 L1 9" stroke="rgba(255,255,255,0.7)" strokeWidth="1" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
        </div>
    );
});

export default TitleBar;
