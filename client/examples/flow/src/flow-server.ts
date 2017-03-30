import {
    TYPES, IActionDispatcher, ActionHandlerRegistry, ViewRegistry, RequestModelAction, UpdateModelAction, Action
} from "../../../src/base"
import { SGraphView } from "../../../src/graph"
import { SelectCommand, SetBoundsCommand } from "../../../src/features"
import { ExecutionNodeView, BarrierNodeView, FlowEdgeView } from "./views"
import createContainer from "./di.config"
import { WebSocketDiagramServer } from "../../../src/remote"

export default function runFlowServer() {
    const container = createContainer()

    // Register commands
    const actionHandlerRegistry = container.get<ActionHandlerRegistry>(TYPES.ActionHandlerRegistry)
    const dispatcher = container.get<IActionDispatcher>(TYPES.IActionDispatcher)
    actionHandlerRegistry.registerServerMessage(SelectCommand.KIND)
    actionHandlerRegistry.registerServerMessage(RequestModelAction.KIND)
    actionHandlerRegistry.registerServerMessage(SetBoundsCommand.KIND)
    actionHandlerRegistry.registerTranslator(UpdateModelAction.KIND, update => new RequestModelAction('flow'))

    // Register views
    const viewRegistry = container.get<ViewRegistry>(TYPES.ViewRegistry)
    viewRegistry.register('flow', SGraphView)
    viewRegistry.register('task', ExecutionNodeView)
    viewRegistry.register('barrier', BarrierNodeView)
    viewRegistry.register('edge', FlowEdgeView)

    // Connect to the diagram server
    const diagramServer = container.get<WebSocketDiagramServer>(TYPES.IDiagramServer)
    diagramServer.setFilter((action: Action) => !action.hasOwnProperty('modelType') || action['modelType'] == 'flow')
    diagramServer.connect('ws://localhost:8080/diagram').then(connection => {
        // Run
        const action = new RequestModelAction('flow')
        dispatcher.dispatch(action)
    })
}
