import assert from "assert";
import { cropImageFF } from "../lib/tasks/crop-image";
import { extractFrameFF } from "../lib/tasks/extract-frame";
import { runLLM } from "../lib/tasks/llm";
import { callGemini } from "../lib/llm";
import { createExecutionPlan, collectNodeInputs } from "../lib/workflow-execution";

// Valid 100x100 red PNG image as base64 data URI
const samplePngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAACXBIWXMAAAABAAAAAQBPJcTWAAAB" +
  "FklEQVR4nO3OUQkAIABEsevfWbCCf+OBsADb2b5HfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q" +
  "4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIH" +
  "IX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+" +
  "EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDi" +
  "ByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EOIHIX4Q4gchfhDiByF+EHIBXZ+dC+6v" +
  "2iYAAAAASUVORK5CYII=";

const sampleInputUrl = `data:image/png;base64,${samplePngBase64}`;

async function runVerification() {
  console.log("🧪 Running workflow execution verification test...\n");

  // 1. Verify cropImageFF execution
  console.log("  Step 1: Testing cropImageFF processing...");
  const cropResult = await cropImageFF({
    imageUrl: sampleInputUrl,
    xPercent: 10,
    yPercent: 10,
    widthPercent: 50,
    heightPercent: 50,
  });

  assert.strictEqual(cropResult.success, true, `cropImageFF failed: ${cropResult.error}`);
  assert.ok(cropResult.outputUrl, "cropImageFF did not return an outputUrl");
  assert.ok(
    cropResult.outputUrl.startsWith("data:image/png;base64,"),
    "cropImageFF output is not a valid png data url"
  );

  // Critical assertion: outputUrl MUST differ from inputUrl (proves FFmpeg crop actually ran, not passed through)
  assert.notStrictEqual(
    cropResult.outputUrl,
    sampleInputUrl,
    "❌ FAILURE: crop node passed through input URL unchanged without executing FFmpeg crop!"
  );
  console.log("  ✅ CropImage node successfully executed FFmpeg and produced a new cropped image\n");

  // 2. Build multi-node workflow: Image -> Crop -> LLM
  console.log("  Step 2: Testing workflow topological execution plan & input propagation...");
  const nodes = [
    {
      id: "node-image-1",
      type: "uploadImage",
      data: { nodeType: "uploadImage", imageUrl: sampleInputUrl },
      position: { x: 0, y: 0 },
    },
    {
      id: "node-crop-2",
      type: "cropImage",
      data: {
        nodeType: "cropImage",
        xPercent: 25,
        yPercent: 25,
        widthPercent: 50,
        heightPercent: 50,
      },
      position: { x: 200, y: 0 },
    },
    {
      id: "node-llm-3",
      type: "llm",
      data: {
        nodeType: "llm",
        systemPrompt: "Analyze the image",
        userMessage: "What is in the cropped region?",
      },
      position: { x: 400, y: 0 },
    },
  ];

  const edges = [
    {
      id: "edge-1-2",
      source: "node-image-1",
      target: "node-crop-2",
      targetHandle: "image_url",
    },
    {
      id: "edge-2-3",
      source: "node-crop-2",
      target: "node-llm-3",
      targetHandle: "images",
    },
  ];

  const plan = createExecutionPlan(nodes, edges);
  assert.deepStrictEqual(
    plan.executionOrder,
    ["node-image-1", "node-crop-2", "node-llm-3"],
    "Execution order must be topological from Image -> Crop -> LLM"
  );
  console.log("  ✅ Topological execution order verified:", plan.executionOrder);

  const nodeOutputs = new Map<string, Record<string, any>>();

  // Step 1: UploadImage node output
  nodeOutputs.set("node-image-1", { outputUrl: sampleInputUrl });

  // Step 2: Crop node receives input from UploadImage node
  const cropInputs = collectNodeInputs("node-crop-2", nodes, edges, nodeOutputs);
  assert.strictEqual(
    cropInputs.image_url,
    sampleInputUrl,
    "Crop node did not receive image_url from UploadImage node"
  );

  // Step 3: Crop executes and produces new output
  nodeOutputs.set("node-crop-2", { outputUrl: cropResult.outputUrl });

  // Step 4: LLM node collects inputs from Crop node
  const llmInputs = collectNodeInputs("node-llm-3", nodes, edges, nodeOutputs);
  assert.strictEqual(
    llmInputs.images,
    cropResult.outputUrl,
    "LLM node did not receive cropped outputUrl as image input"
  );
  assert.notStrictEqual(
    llmInputs.images,
    sampleInputUrl,
    "LLM node received raw uncropped input instead of cropped output!"
  );
  // 3. Test callGemini and runLLM interface and error handling
  console.log("  Step 3: Testing callGemini and runLLM consolidation...");
  const prevApiKey = process.env.GOOGLE_AI_API_KEY;
  delete process.env.GOOGLE_AI_API_KEY;

  try {
    let callGeminiThrew = false;
    try {
      await callGemini({
        userMessage: "Hello",
        images: [sampleInputUrl],
      });
    } catch (e: any) {
      callGeminiThrew = true;
      assert.ok(
        e.message.includes("GOOGLE_AI_API_KEY"),
        `Unexpected error message: ${e.message}`
      );
    }
    assert.strictEqual(callGeminiThrew, true, "callGemini should throw error when API key is missing");

    const llmRunResult = await runLLM({
      userMessage: "Hello",
      images: [sampleInputUrl],
    });
    assert.ok(
      llmRunResult.error?.includes("GOOGLE_AI_API_KEY"),
      `Unexpected runLLM error: ${llmRunResult.error}`
    );
    console.log("  ✅ callGemini & runLLM successfully validated with unified fallback and error handling\n");
  } finally {
    if (prevApiKey !== undefined) {
      process.env.GOOGLE_AI_API_KEY = prevApiKey;
    }
  }

  // 4. Test multi-provider LLM and estimateCost
  console.log("  Step 4: Testing multi-provider LLM and estimateCost calculation...");
  const { callLLM, estimateCost } = await import("../lib/llm");

  const costFlash = estimateCost("gemini", "gemini-1.5-flash", 1000, 500);
  assert.ok(costFlash > 0, "Cost calculation for gemini should be positive");
  const costGpt4o = estimateCost("openai", "gpt-4o", 1000, 500);
  assert.ok(costGpt4o > costFlash, "GPT-4o should be more expensive than Gemini Flash");
  const costClaude = estimateCost("anthropic", "claude-3-5-sonnet-20241022", 1000, 500);
  assert.ok(costClaude > 0, "Claude cost should be positive");

  let openAIThrew = false;
  try {
    await callLLM({
      provider: "openai",
      userMessage: "Hello",
    });
  } catch (err: any) {
    openAIThrew = true;
    assert.ok(err.message.includes("OPENAI_API_KEY"), `Unexpected OpenAI error: ${err.message}`);
  }
  assert.strictEqual(openAIThrew, true, "callLLM with OpenAI should throw when OPENAI_API_KEY is unset");

  let anthropicThrew = false;
  try {
    await callLLM({
      provider: "anthropic",
      userMessage: "Hello",
    });
  } catch (err: any) {
    anthropicThrew = true;
    assert.ok(err.message.includes("ANTHROPIC_API_KEY"), `Unexpected Anthropic error: ${err.message}`);
  }
  // 5. Test executeHttpRequest
  console.log("  Step 5: Testing executeHttpRequest execution & validation...");
  const { executeHttpRequest } = await import("../lib/tasks/http-request");

  const missingUrlResult = await executeHttpRequest({ url: "" });
  assert.strictEqual(missingUrlResult.success, false);
  assert.ok(missingUrlResult.error?.includes("URL is required"));

  const invalidProtoResult = await executeHttpRequest({ url: "ftp://invalid-domain.com" });
  assert.strictEqual(invalidProtoResult.success, false);
  assert.ok(invalidProtoResult.error?.includes("Must start with http:// or https://"));

  // 6. Test evaluateCondition & DAG branch pruning
  console.log("  Step 6: Testing conditional evaluation and DAG branch pruning...");
  const { evaluateCondition } = await import("../lib/tasks/conditional");
  const { findDownstreamDescendants } = await import("../lib/workflow-execution");

  // Operators test
  assert.strictEqual(evaluateCondition({ value: "apple", operator: "equals", compareValue: "apple" }).result, true);
  assert.strictEqual(evaluateCondition({ value: "apple", operator: "equals", compareValue: "banana" }).result, false);
  assert.strictEqual(evaluateCondition({ value: "hello world", operator: "contains", compareValue: "world" }).result, true);
  assert.strictEqual(evaluateCondition({ value: 25, operator: "greater_than", compareValue: 10 }).result, true);
  assert.strictEqual(evaluateCondition({ value: "", operator: "is_empty" }).result, true);
  assert.strictEqual(evaluateCondition({ value: "not empty", operator: "is_not_empty" }).result, true);

  // DAG Branch pruning test
  const branchingEdges = [
    { id: "e1", source: "cond-1", target: "node-true-branch", sourceHandle: "true" },
    { id: "e2", source: "node-true-branch", target: "node-true-leaf" },
    { id: "e3", source: "cond-1", target: "node-false-branch", sourceHandle: "false" },
    { id: "e4", source: "node-false-branch", target: "node-false-leaf" },
  ];

  const falseDescendants = findDownstreamDescendants("node-false-branch", branchingEdges as any);
  assert.ok(falseDescendants.has("node-false-leaf"), "Downstream leaf on false branch should be pruned when true is chosen");
  assert.strictEqual(falseDescendants.has("node-true-branch"), false);

  // 7. Test workflow event hub and subscription
  console.log("  Step 7: Testing workflow event hub and subscription...");
  const { emitWorkflowEvent, subscribeWorkflowEvents } = await import("../lib/events");

  const testWorkflowId = "wf-test-sse-123";
  const receivedEvents: any[] = [];

  const unsubscribe = subscribeWorkflowEvents(testWorkflowId, (evt) => {
    receivedEvents.push(evt);
  });

  emitWorkflowEvent({
    type: "workflow:start",
    workflowId: testWorkflowId,
    runId: "run-test-1",
    status: "RUNNING",
  });

  emitWorkflowEvent({
    type: "node:start",
    workflowId: testWorkflowId,
    runId: "run-test-1",
    nodeId: "node-llm-1",
    nodeType: "llm",
    status: "RUNNING",
  });

  emitWorkflowEvent({
    type: "node:complete",
    workflowId: testWorkflowId,
    runId: "run-test-1",
    nodeId: "node-llm-1",
    nodeType: "llm",
    status: "SUCCESS",
    outputs: { output: "Generated response" },
  });

  assert.strictEqual(receivedEvents.length, 3, "Should receive 3 emitted events");
  assert.strictEqual(receivedEvents[0].type, "workflow:start");
  assert.strictEqual(receivedEvents[1].type, "node:start");
  assert.strictEqual(receivedEvents[2].type, "node:complete");
  assert.strictEqual(receivedEvents[2].outputs.output, "Generated response");

  // 8. Test Template Library export & instantiation
  console.log("  Step 8: Testing Template Library export & instantiation...");
  const { STARTER_TEMPLATES, instantiateTemplate, exportWorkflowAsTemplate } = await import("../lib/templates");

  assert.ok(STARTER_TEMPLATES.length >= 4, "Should have at least 4 curated starter templates");

  const starterTpl = STARTER_TEMPLATES[0];
  const { nodes: instNodes, edges: instEdges } = instantiateTemplate(starterTpl);

  assert.strictEqual(instNodes.length, starterTpl.nodes.length, "Instantiated node count must match template");
  assert.strictEqual(instEdges.length, starterTpl.edges.length, "Instantiated edge count must match template");
  
  // Ensure new node IDs are generated and edges are remapped
  const originalNodeIds = new Set(starterTpl.nodes.map((n) => n.id));
  instNodes.forEach((node) => {
    assert.strictEqual(originalNodeIds.has(node.id), false, "Instantiated nodes must have fresh unique IDs");
  });

  const exported = exportWorkflowAsTemplate(
    "Custom Test Template",
    "A custom test workflow export",
    "Conditional Automation",
    instNodes,
    instEdges,
    ["test", "export"]
  );

  assert.strictEqual(exported.name, "Custom Test Template");
  assert.strictEqual(exported.category, "Conditional Automation");
  assert.strictEqual(exported.nodes.length, instNodes.length);
  assert.strictEqual(exported.edges.length, instEdges.length);
  console.log("  ✅ Template library instantiation, remapping, and export verified\n");

  console.log("🎉 All workflow execution assertions passed successfully!");
}

runVerification().catch((err) => {
  console.error("\n❌ Verification test failed:", err);
  process.exit(1);
});
