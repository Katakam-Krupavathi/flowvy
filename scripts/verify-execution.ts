import assert from "assert";
import { cropImageFF } from "../lib/tasks/crop-image";
import { extractFrameFF } from "../lib/tasks/extract-frame";
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
  console.log("  ✅ Chaining verified: Cropped outputUrl successfully propagated to LLM images input\n");

  console.log("🎉 All workflow execution assertions passed successfully!");
}

runVerification().catch((err) => {
  console.error("\n❌ Verification test failed:", err);
  process.exit(1);
});
