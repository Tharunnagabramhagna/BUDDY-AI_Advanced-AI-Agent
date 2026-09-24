import { useCallback, useEffect, useState } from 'react';

export function useWindowControls() {
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

    return { handleMinimize, handleMaximize, handleClose, isMaximized };
}

export default useWindowControls;
