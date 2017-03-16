import {
    TYPES, ActionDispatcher, MoveCommand, ElementMove, MoveAction, SelectCommand, SetModelAction, SelectAction,
    ActionHandlerRegistry, ViewRegistry, ResizeAction, ResizeCommand
} from "../../../src/base"
import {
    GGraphView, StraightEdgeView, SNode, SGraphFactory, SNodeSchema, SEdgeSchema
} from "../../../src/graph"
import {CircleNodeView} from "./views"
import createContainer from "./inversify.config"

export default function runStandalone() {
    const container = createContainer()

    // Register commands
    const actionHandlerRegistry = container.get(ActionHandlerRegistry)
    actionHandlerRegistry.registerCommand(MoveAction.KIND, MoveCommand)
    actionHandlerRegistry.registerCommand(SelectAction.KIND, SelectCommand)
    actionHandlerRegistry.registerCommand(ResizeAction.KIND, ResizeCommand)

    // Register views
    const viewRegistry = container.get(ViewRegistry)
    viewRegistry.register('graph', GGraphView)
    viewRegistry.register('node:circle', CircleNodeView)
    viewRegistry.register('edge:straight', StraightEdgeView)

    // Initialize gmodel
    const modelFactory = new SGraphFactory()
    const node0 = {id: 'node0', type: 'node:circle', x: 100, y: 100};
    const node1 = {id: 'node1', type: 'node:circle', x: 200, y: 150, selected: true};
    const edge0 = {id: 'edge0', type: 'edge:straight', sourceId: 'node0', targetId: 'node1'};
    const graph = modelFactory.createRoot({id: 'graph', type: 'graph', children: [node0, node1, edge0]});

    // Run
    const dispatcher = container.get(ActionDispatcher)
    const action = new SetModelAction(graph);
    dispatcher.dispatch(action);

    let count = 2

    function addNode() {
        const newNode: SNodeSchema = {
            id: 'node' + count,
            type: 'node:circle',
            x: Math.random() * 1024,
            y: Math.random() * 768,
            width: 40
        }
        graph.add(modelFactory.createElement(newNode))
        const newEdge: SEdgeSchema = {
            id: 'edge' + count,
            type: 'edge:straight',
            sourceId: 'node0',
            targetId: 'node' + count++
        }
        graph.add(modelFactory.createElement(newEdge))
    }

    for (let i = 0; i < 200; ++i) {
        addNode()
    }
    dispatcher.dispatch(new SetModelAction(graph))

    // button behavior
    document.getElementById('addNode')!.addEventListener('click', () => {
        addNode()
        dispatcher.dispatch(new SetModelAction(graph))
        document.getElementById('graph')!.focus()
    })

    document.getElementById('scrambleNodes')!.addEventListener('click', function (e) {
        const nodeMoves: ElementMove[] = []
        graph.children.forEach(shape => {
            if (shape instanceof SNode) {
                nodeMoves.push({
                    elementId: shape.id,
                    toPosition: {
                        x: Math.random() * 1024,
                        y: Math.random() * 768
                    }
                })
            }
        })
        dispatcher.dispatch(new MoveAction(nodeMoves, true))
        document.getElementById('graph')!.focus()
    })

}
