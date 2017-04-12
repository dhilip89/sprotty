import { SModelRoot } from "../model/smodel"
import { IModelFactory } from "../model/smodel-factory"
import { IViewer } from "../view/viewer"
import { ILogger } from "../../utils/logging"
import { AnimationFrameSyncer } from "../animations/animation-frame-syncer"
import { Action, ActionHandler } from "./actions"

/**
 * A command holds the behaviour of an action.
 * It is executed on a command stack and can be undone / redone.
 *
 * Each command should define a static string property KIND that matches 
 * the associated action.
 * Clients should not implement this directly but rather inherit from
 * one of its abstract implementators.
 */
export interface Command {
    execute(context: CommandExecutionContext): CommandResult

    undo(context: CommandExecutionContext): CommandResult

    redo(context: CommandExecutionContext): CommandResult

    merge(command: Command, context: CommandExecutionContext): boolean
}

export type CommandResult = SModelRoot | Promise<SModelRoot>

export interface CommandFactory {
    KIND: string
    new (a: Action): Command
}

/**
 * Base class for all commands.
 */
export abstract class AbstractCommand implements Command {

    abstract execute(context: CommandExecutionContext): CommandResult

    abstract undo(context: CommandExecutionContext): CommandResult

    abstract redo(context: CommandExecutionContext): CommandResult

    merge(command: Command, context: CommandExecutionContext): boolean {
        return false
    }
}

/**
 * A hidden command is used to trigger the rendering of a model on a 
 * hidden canvas.
 * 
 * Some graphical elements are styled using CSS, others have bounds that
 * require to layout their children before being computed. In such cases
 * we cannot tell about the size of elements without acutally rendering 
 * the DOM. We render them to an invisible canvas. This can be achieved 
 * using hidden commands.
 * 
 * Hidden commands do not change the model directly, and are as such 
 * neither undoable nor redoable. The command stack does not push them on 
 * any stack and forwards the resulting model to the invisible viewer.
 */
export abstract class AbstractHiddenCommand extends AbstractCommand {
    abstract execute(context: CommandExecutionContext): SModelRoot

    undo(context: CommandExecutionContext): CommandResult {
        context.logger.error(this, 'Cannot undo a hidden command')
        return context.root
    }

    redo(context: CommandExecutionContext): CommandResult {
        context.logger.error(this, 'Cannot redo a hidden command')
        return context.root
    }
}

/**
 * A system command is triggered by the system, e.g. in order to update bounds
 * in the model with data fetched from the DOM.
 * 
 * As it is automatically triggered it should not count as a single command in 
 * undo/redo operations. Into the bargain, such an automatic command could occur
 * after an undo and as such make the next redo command invalid because it is 
 * based on a model state that has changed. The command stack handles system 
 * commands in a special way to overcome these issues.
 */
export abstract class AbstractSystemCommand extends AbstractCommand {
}

export interface CommandExecutionContext {
    root: SModelRoot
    modelFactory: IModelFactory
    modelChanged: IViewer
    duration: number
    logger: ILogger
    syncer: AnimationFrameSyncer
}

export class CommandActionHandler implements ActionHandler {
    constructor(private commandType: new (a: Action) => Command) {
    }

    handle(action: Action): Command | Action | undefined {
        return new this.commandType(action)
    }
}
