import { useCallback, useEffect, useRef } from 'react';
import type {
    MouseEvent as ReactMouseEvent,
    PointerEvent as ReactPointerEvent,
    RefObject,
} from 'react';

const STORAGE_KEY = 'versora:global-bot-position:v2';
const VIEWPORT_MARGIN = 12;
const DRAG_THRESHOLD = 5;
const CHATTER_ABOVE_MIN_SPACE = 120;

interface OrbPosition {
    x: number;
    y: number;
}

interface DragSession {
    pointerId: number;
    startX: number;
    startY: number;
    origin: OrbPosition;
    dragging: boolean;
}

interface UseDraggableOrbOptions {
    anchorRef: RefObject<HTMLDivElement | null>;
    size: number;
    onActivate: (event: ReactMouseEvent<HTMLButtonElement>) => void;
    onPointerStart: () => void;
}

function clampPosition(position: OrbPosition, size: number): OrbPosition {
    if (typeof window === 'undefined') return position;
    const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - size - VIEWPORT_MARGIN);
    const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - size - VIEWPORT_MARGIN);
    return {
        x: Math.min(Math.max(position.x, VIEWPORT_MARGIN), maxX),
        y: Math.min(Math.max(position.y, VIEWPORT_MARGIN), maxY),
    };
}

function readStoredPosition(size: number): OrbPosition | null {
    if (typeof window === 'undefined') return null;
    try {
        const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
        if (!value || typeof value !== 'object') return null;
        const { x, y } = value as Record<string, unknown>;
        if (typeof x !== 'number' || !Number.isFinite(x)) return null;
        if (typeof y !== 'number' || !Number.isFinite(y)) return null;
        return clampPosition({ x, y }, size);
    } catch {
        return null;
    }
}

function storePosition(position: OrbPosition) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    } catch {
        // Repositioning remains usable when storage is unavailable.
    }
}

function applyChatterPlacement(node: HTMLDivElement, position: OrbPosition, size: number) {
    node.dataset.chatterHorizontal = position.x + size / 2 <= window.innerWidth / 2
        ? 'right'
        : 'left';
    node.dataset.chatterVertical = position.y >= CHATTER_ABOVE_MIN_SPACE
        ? 'above'
        : 'below';
}

function applyPosition(node: HTMLDivElement, position: OrbPosition, size: number) {
    const documentRelative = window.getComputedStyle(node).position === 'absolute';
    const paintX = position.x + (documentRelative ? window.scrollX : 0);
    const paintY = position.y + (documentRelative ? window.scrollY : 0);
    node.dataset.positioned = 'true';
    node.dataset.coordinateSpace = documentRelative ? 'document' : 'viewport';
    node.style.setProperty('--cl-ai-orb-x', `${paintX}px`);
    node.style.setProperty('--cl-ai-orb-y', `${paintY}px`);
    applyChatterPlacement(node, position, size);
}

/**
 * Free dragging for the orb without turning a drag release into a click. Fixed
 * surfaces paint viewport coordinates; route-owned absolute surfaces add the
 * current scroll offset so dragging remains pointer-aligned and can still scroll
 * away with its document section. Transient movement stays outside React state
 * and is painted at most once per animation frame.
 */
export function useDraggableOrb({
    anchorRef,
    size,
    onActivate,
    onPointerStart,
}: UseDraggableOrbOptions) {
    const positionRef = useRef<OrbPosition | null>(null);
    const sessionRef = useRef<DragSession | null>(null);
    const frameRef = useRef<number | null>(null);
    const suppressClickRef = useRef(false);

    const paint = useCallback(() => {
        frameRef.current = null;
        const node = anchorRef.current;
        const position = positionRef.current;
        if (node && position) applyPosition(node, position, size);
    }, [anchorRef, size]);

    const schedulePaint = useCallback(() => {
        if (frameRef.current !== null) return;
        frameRef.current = window.requestAnimationFrame(paint);
    }, [paint]);

    // This hook lives on the button while the positioned anchor is its parent.
    // Parent refs are not guaranteed to be available during a child layout
    // effect, so restore after the complete portal tree has committed.
    useEffect(() => {
        const stored = readStoredPosition(size);
        const node = anchorRef.current;
        if (!node) return;
        if (stored) {
            positionRef.current = stored;
            applyPosition(node, stored, size);
            return;
        }

        const rect = node.getBoundingClientRect();
        applyChatterPlacement(node, { x: rect.left, y: rect.top }, size);
    }, [anchorRef, size]);

    useEffect(() => {
        const handleResize = () => {
            const current = positionRef.current;
            if (!current) {
                const node = anchorRef.current;
                if (!node) return;
                const rect = node.getBoundingClientRect();
                applyChatterPlacement(node, { x: rect.left, y: rect.top }, size);
                return;
            }
            const clamped = clampPosition(current, size);
            if (clamped.x === current.x && clamped.y === current.y) {
                if (anchorRef.current) applyChatterPlacement(anchorRef.current, current, size);
                return;
            }
            positionRef.current = clamped;
            schedulePaint();
            storePosition(clamped);
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        };
    }, [anchorRef, schedulePaint, size]);

    const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || !event.isPrimary) return;
        onPointerStart();
        const node = anchorRef.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        sessionRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            origin: { x: rect.left, y: rect.top },
            dragging: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    }, [anchorRef, onPointerStart]);

    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        const session = sessionRef.current;
        if (!session || session.pointerId !== event.pointerId) return;

        const dx = event.clientX - session.startX;
        const dy = event.clientY - session.startY;
        if (!session.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

        if (!session.dragging) {
            session.dragging = true;
            if (anchorRef.current) anchorRef.current.dataset.dragging = 'true';
        }
        event.preventDefault();
        positionRef.current = clampPosition({
            x: session.origin.x + dx,
            y: session.origin.y + dy,
        }, size);
        schedulePaint();
    }, [anchorRef, schedulePaint, size]);

    const finishSession = useCallback((event: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) => {
        const session = sessionRef.current;
        if (!session || session.pointerId !== event.pointerId) return;
        sessionRef.current = null;

        const node = anchorRef.current;
        if (node) delete node.dataset.dragging;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        if (!session.dragging) return;
        if (frameRef.current !== null) {
            window.cancelAnimationFrame(frameRef.current);
            paint();
        }
        if (positionRef.current) storePosition(positionRef.current);

        // A pointercancel has no following click. A normal pointerup does, and
        // that compatibility click must not toggle the assistant panel.
        suppressClickRef.current = !cancelled;
        window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }, [anchorRef, paint]);

    const handleClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            return;
        }
        onActivate(event);
    }, [onActivate]);

    return {
        onClick: handleClick,
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => finishSession(event, false),
        onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => finishSession(event, true),
    };
}
