import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { GlobalBotMessageTag } from './messages/types';

interface GlobalBotSpeechBubbleProps {
    line: string | null;
    messageKey?: string | undefined;
    wide?: boolean;
    tags?: readonly GlobalBotMessageTag[] | undefined;
    action?: {
        label: string;
        onClick: () => void;
    } | undefined;
}

export function GlobalBotSpeechBubble({
    line,
    messageKey,
    wide = false,
    tags,
    action,
}: GlobalBotSpeechBubbleProps) {
    const reducedMotion = useReducedMotion() === true;
    const structured = Boolean(tags?.length);
    const announced = wide || Boolean(action);

    return (
        <AnimatePresence initial={false}>
            {line && (
                <motion.div
                    key={messageKey ?? line}
                    className="cl-ai-orb-chatter"
                    data-interactive={action ? 'true' : 'false'}
                    data-wide={wide ? 'true' : 'false'}
                    data-structured={structured ? 'true' : 'false'}
                    {...(announced
                        ? { role: 'status', 'aria-live': 'polite' as const }
                        : { 'aria-hidden': true })}
                    initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reducedMotion ? {} : { opacity: 0, scale: 0.985 }}
                    transition={{
                        duration: reducedMotion ? 0 : 0.24,
                        ease: [0.2, 0.8, 0.2, 1],
                    }}
                >
                    <span className="cl-ai-orb-chatter__text">{line}</span>
                    {structured && (
                        <span className="cl-ai-orb-chatter__tags" role="list">
                            {tags?.map((tag) => (
                                <span
                                    key={`${tag.label}:${tag.value}`}
                                    role="listitem"
                                    data-tone={tag.tone}
                                    className="cl-ai-orb-chatter__tag">
                                    <span>{tag.label}</span>
                                    <strong>{tag.value}</strong>
                                </span>
                            ))}
                        </span>
                    )}
                    {action && (
                        <button
                            type="button"
                            className="cl-ai-orb-chatter__action"
                            onClick={action.onClick}>
                            {action.label}
                        </button>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
