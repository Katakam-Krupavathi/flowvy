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
  assert.strictEqual(anthropicThrew, true, "callLLM with Anthropic should throw when ANTHROPIC_API_KEY is unset");
  console.log("  ✅ Multi-provider LLM and cost estimation validated\n");

  console.log("🎉 All workflow execution assertions passed successfully!");
}

runVerification().catch((err) => {
  console.error("\n❌ Verification test failed:", err);
  process.exit(1);
});
