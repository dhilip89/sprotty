/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { Action } from "../../base/actions/action";
import { Command, CommandExecutionContext, CommandResult } from "../../base/commands/command";
import { SModelElement, SModelRoot, SParentElement, SModelIndex } from '../../base/model/smodel';
import { Point } from "../../utils/geometry";
import { Routable, isRoutable, canEditRouting, SRoutingHandle } from './model';
import { Animation } from '../../base/animations/animation';

export function createRoutingHandle(kind: 'junction' | 'line', parentId: string, index: number): SRoutingHandle {
    const handle = new SRoutingHandle();
    handle.type = kind === 'junction' ? 'routing-point' : 'volatile-routing-point';
    handle.kind = kind;
    handle.pointIndex = index;
    return handle;
}

export function createRoutingHandles(editTarget: SParentElement & Routable): void {
    const rpCount = editTarget.routingPoints.length;
    const targetId = editTarget.id;
    editTarget.add(createRoutingHandle('line', targetId, -1));
    for (let i = 0; i < rpCount; i++) {
        editTarget.add(createRoutingHandle('junction', targetId, i));
        editTarget.add(createRoutingHandle('line', targetId, i));
    }
}

export class SwitchEditModeAction implements Action {
    kind = SwitchEditModeCommand.KIND;

    constructor(public readonly elementsToActivate: string[] = [],
                public readonly elementsToDeactivate: string[] = []) {
    }
}

@injectable()
export class SwitchEditModeCommand extends Command {
    static KIND: string = "switchEditMode";

    constructor(public action: SwitchEditModeAction) {
        super();
    }

    execute(context: CommandExecutionContext): CommandResult {
        const index = context.root.index;
        this.action.elementsToActivate.forEach(id => {
            const element = index.getById(id);
            if (element !== undefined && canEditRouting(element) && element instanceof SParentElement) {
                createRoutingHandles(element);
            }
        });
        this.action.elementsToDeactivate.forEach(id => {
            const element = index.getById(id);
            if (element !== undefined && isRoutable(element) && element instanceof SParentElement) {
                element.removeAll(child => child instanceof SRoutingHandle);
            }
        });
        return context.root;
    }

    undo(context: CommandExecutionContext): CommandResult {
        return context.root; // TODO
    }

    redo(context: CommandExecutionContext): CommandResult {
        return this.execute(context);
    }
}

export interface HandleMove {
    elementId: string
    fromPosition?: Point
    toPosition: Point
}

export interface ResolvedHandleMove {
    elementId: string
    element: SRoutingHandle
    fromPosition?: Point
    toPosition: Point
}

export class MoveRoutingHandleAction implements Action {
    kind: string = MoveRoutingHandleCommand.KIND;

    constructor(public readonly moves: HandleMove[],
                public readonly animate: boolean = true) {
    }

}

@injectable()
export class MoveRoutingHandleCommand extends Command {
    static KIND: string = 'moveHandle';

    resolvedMoves: Map<string, ResolvedHandleMove> = new Map;
    originalRoutingPoints: Map<string, Point[]> = new Map;

    constructor(protected action: MoveRoutingHandleAction) {
        super();
    }

    execute(context: CommandExecutionContext) {
        const model = context.root;
        this.action.moves.forEach(
            move => {
                const resolvedMove = this.resolve(move, model.index);
                if (resolvedMove !== undefined) {
                    this.resolvedMoves.set(resolvedMove.elementId, resolvedMove);
                    const parent = resolvedMove.element.parent;
                    if (isRoutable(parent))
                        this.originalRoutingPoints.set(parent.id, parent.routingPoints.slice());
                }
            }
        );
        if (this.action.animate) {
            return new MoveHandlesAnimation(model, this.resolvedMoves, this.originalRoutingPoints, context).start();
        } else {
            return this.doMove(context);
        }
    }

    protected resolve(move: HandleMove, index: SModelIndex<SModelElement>): ResolvedHandleMove | undefined {
        const element = index.getById(move.elementId);
        if (element instanceof SRoutingHandle) {
            return {
                elementId: move.elementId,
                element: element,
                fromPosition: move.fromPosition,
                toPosition: move.toPosition
            };
        }
        return undefined;
    }

    protected doMove(context: CommandExecutionContext): SModelRoot {
        this.resolvedMoves.forEach(res => {
            const handle = res.element;
            const parent = handle.parent;
            if (isRoutable(parent)) {
                const points = parent.routingPoints;
                let index = handle.pointIndex;
                if (handle.kind === 'line') {
                    // Upgrade to a proper routing point
                    handle.kind = 'junction';
                    handle.type = 'routing-point';
                    points.splice(index + 1, 0, res.fromPosition || points[Math.max(index, 0)]);
                    parent.children.forEach(child => {
                        if (child instanceof SRoutingHandle && (child === handle || child.pointIndex > index))
                            child.pointIndex++;
                    });
                    parent.add(createRoutingHandle('line', parent.id, index));
                    parent.add(createRoutingHandle('line', parent.id, index + 1));
                    index++;
                }
                if (index >= 0 && index < points.length) {
                    points[index] = res.toPosition;
                }
            }
        });
        return context.root;
    }

    undo(context: CommandExecutionContext): CommandResult {
        if (this.action.animate) {
            return new MoveHandlesAnimation(context.root, this.resolvedMoves, this.originalRoutingPoints, context, true).start();
        } else {
            this.resolvedMoves.forEach(res => {
                const handle = res.element;
                const parent = handle.parent;
                const points = this.originalRoutingPoints.get(parent.id);
                if (points !== undefined && isRoutable(parent)) {
                    parent.routingPoints = points;
                    parent.removeAll(e => e instanceof SRoutingHandle);
                    createRoutingHandles(parent);
                }
            });
            return context.root;
        }
    }

    redo(context: CommandExecutionContext): CommandResult {
        if (this.action.animate) {
            return new MoveHandlesAnimation(context.root, this.resolvedMoves, this.originalRoutingPoints, context, false).start();
        } else {
            return this.doMove(context);
        }
    }

}

export class MoveHandlesAnimation extends Animation {

    constructor(protected model: SModelRoot,
                public handleMoves: Map<string, ResolvedHandleMove>,
                public originalRoutingPoints: Map<string, Point[]>,
                context: CommandExecutionContext,
                protected reverse: boolean = false) {
        super(context);
    }

    tween(t: number) {
        this.handleMoves.forEach((handleMove) => {
            const parent = handleMove.element.parent;
            if (isRoutable(parent) && handleMove.fromPosition !== undefined) {
                if (this.reverse && t === 1) {
                    const revPoints = this.originalRoutingPoints.get(parent.id);
                    if (revPoints !== undefined) {
                        parent.routingPoints = revPoints;
                        parent.removeAll(e => e instanceof SRoutingHandle);
                        createRoutingHandles(parent);
                        return;
                    }
                }
                const points = parent.routingPoints;
                const index = handleMove.element.pointIndex;
                if (index >= 0 && index < points.length) {
                    if (this.reverse) {
                        points[index] = {
                            x: (1 - t) * handleMove.toPosition.x + t * handleMove.fromPosition.x,
                            y: (1 - t) * handleMove.toPosition.y + t * handleMove.fromPosition.y
                        };
                    } else {
                        points[index] = {
                            x: (1 - t) * handleMove.fromPosition.x + t * handleMove.toPosition.x,
                            y: (1 - t) * handleMove.fromPosition.y + t * handleMove.toPosition.y
                        };
                    }
                }
            }
        });
        return this.model;
    }
}
