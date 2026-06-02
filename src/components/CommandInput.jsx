import { Mic, Send } from 'lucide-react';
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

const CommandInput = memo(forwardRef(function CommandInput({ isLoading, isListening, sttOnline, onEscape, onSubmit, onMicClick }, ref) {
    const [hasCommand, setHasCommand] = useState(false);
    const innerInputRef = useRef(null);

    const handleChange = useCallback((event) => {
        const val = event.target.value;
        const currentlyHasCommand = val.trim().length > 0;
        if (currentlyHasCommand !== hasCommand) {
            setHasCommand(currentlyHasCommand);
        }
    }, [hasCommand]);

    const handleSubmit = useCallback(async () => {
        const currentCommand = innerInputRef.current?.value || '';
        if (!currentCommand.trim()) return;
        
        const submitted = await onSubmit(currentCommand);

        if (submitted) {
            if (innerInputRef.current) {
                innerInputRef.current.value = '';
            }
            setHasCommand(false);
        }
    }, [onSubmit]);

    const handleKeyDown = useCallback((event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            void handleSubmit();
            return;
        }

        if (event.key === 'Escape') {
            onEscape();
        }
    }, [handleSubmit, onEscape]);

    const handleButtonClick = useCallback(() => {
        void handleSubmit();
    }, [handleSubmit]);

    useImperativeHandle(ref, () => ({
        clear() {
            if (innerInputRef.current) {
                innerInputRef.current.value = '';
            }
            setHasCommand(false);
        },
        focus() {
            innerInputRef.current?.focus();
        },
        setCommand(cmd) {
            if (innerInputRef.current) {
                innerInputRef.current.value = cmd;
                setHasCommand(cmd.trim().length > 0);
            }
        }
    }), []);

    return (
        <>
            <div className="flex-1 relative">
                <input
                    ref={innerInputRef}
                    type="text"
                    defaultValue=""
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Buddy anything..."
                    style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        caretColor: 'rgba(59,130,246,1)',
                        color: 'rgba(255,255,255,0.85)',
                        fontSize: 16,
                        fontWeight: 400,
                        letterSpacing: '-0.015em'
                    }}
                />
            </div>

            {/* STT mic status indicator — always-on listening signal */}
            {hasCommand ? (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                        position: 'absolute', inset: -4, borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
                        opacity: 1, transition: 'opacity 0.3s ease'
                    }} />
                    <button
                        onClick={handleButtonClick}
                        disabled={isLoading}
                        style={{ color: 'rgba(59,130,246,0.95)', transition: 'color 0.2s ease', position: 'relative', zIndex: 1 }}
                    >
                        <Send size={16} strokeWidth={1.5} />
                    </button>
                </div>
            ) : (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    {/* Outer glow when actively processing speech */}
                    {isListening && (
                        <div style={{
                            position: 'absolute', inset: -6, borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(239,68,68,0.25) 0%, transparent 70%)',
                            animation: 'pulse 1s ease-in-out infinite'
                        }} />
                    )}
                    <div
                        style={{
                            width: 28, height: 28, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isListening
                                ? 'rgba(239,68,68,0.15)'
                                : sttOnline
                                    ? 'rgba(52,211,153,0.08)'
                                    : 'rgba(255,255,255,0.04)',
                            border: isListening
                                ? '0.5px solid rgba(239,68,68,0.4)'
                                : sttOnline
                                    ? '0.5px solid rgba(52,211,153,0.3)'
                                    : '0.5px solid rgba(255,255,255,0.1)',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                        }}
                        onClick={() => {
                            if (!sttOnline && onMicClick) {
                                onMicClick();
                            }
                        }}
                    >
                        <Mic size={14} strokeWidth={1.5} style={{
                            color: isListening
                                ? 'rgba(239,68,68,0.9)'
                                : sttOnline
                                    ? 'rgba(52,211,153,0.8)'
                                    : 'rgba(255,255,255,0.25)',
                            transition: 'color 0.3s ease'
                        }} className={isListening ? 'animate-pulse' : ''} />
                    </div>
                </div>
            )}
        </>
    );
}));

export default CommandInput;
