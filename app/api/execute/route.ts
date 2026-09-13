export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { createExecutionPlan, collectNodeInputs } from "@/lib/workflow-execution";
import { cropImageFF } from "@/trigger/crop-image-task";
import { extractFrameFF } from "@/trigger/extract-frame-task";
import { runLLM } from "@/trigger/llm-task";

const executeSchema = z.object({
  workflowId: z.string(),
  nodeIds: z.array(z.string()).optional(),
  nodes: z.any().optional(),
  edges: z.any().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { workflowId, nodeIds, nodes: reqNodes, edges: reqEdges } = executeSchema.parse(body);

    // Fetch workflow
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        userId: user.id,
      },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const nodes = Array.isArray(reqNodes)
      ? (reqNodes as any[])
      : Array.isArray(workflow.nodes)
      ? (workflow.nodes as any[])
      : [];
    const edges = Array.isArray(reqEdges)
      ? (reqEdges as any[])
      : Array.isArray(workflow.edges)
      ? (workflow.edges as any[])
      : [];

    // Determine execution scope
    const scope = nodeIds
      ? nodeIds.length === 1
        ? "SINGLE"
        : "PARTIAL"
      : "FULL";

    const selectedNodes: string[] = nodeIds || nodes.map((n: any) => n.id);

    // Create workflow run
    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        userId: user.id,
        status: "RUNNING",
        scope: scope as any,
        selectedNodes: selectedNodes.length > 0 ? (selectedNodes as any) : null,
      },
    });

    // Start execution asynchronously
    ;(async () => {
      const start = Date.now();
      try {
        const plan = createExecutionPlan(nodes, edges, selectedNodes);
        const nodeOutputs = new Map<string, Record<string, any>>();

        for (const nodeId of plan.executionOrder) {
          if (!selectedNodes.includes(nodeId)) continue;
          const rfNode = nodes.find((n) => n.id === nodeId);
          if (!rfNode) continue;

          const nodeType = rfNode.data?.nodeType || rfNode.type || "unknown";
          const inputs = collectNodeInputs(nodeId, nodes, edges, nodeOutputs);

          const nodeRun = await prisma.nodeRun.create({
            data: {
              runId: run.id,
              nodeId,
              nodeType,
              status: "RUNNING",
              inputs,
            },
          });

          const nodeStart = Date.now();
          let outputs: Record<string, any> | undefined = undefined;
          let errorMsg: string | undefined = undefined;

          try {
            switch (nodeType) {
              case "text": {
                const text = (inputs.text as string) ?? (rfNode.data?.text as string) ?? "";
                outputs = { output: text };
                break;
              }
              case "uploadImage": {
                const url = (inputs.image_url as string) ?? (rfNode.data?.imageUrl as string) ?? "";
                outputs = { outputUrl: url };
                break;
              }
              case "uploadVideo": {
                const url = (inputs.video_url as string) ?? (rfNode.data?.videoUrl as string) ?? "";
                outputs = { outputUrl: url };
                break;
              }
              case "cropImage": {
                const imageUrl =
                  (inputs.image_url as string) ??
                  (inputs.imageUrl as string) ??
                  (rfNode.data?.imageUrl as string) ??
                  (inputs.input as string) ??
                  (rfNode.data?.outputUrl as string) ??
                  "";
                const xPercent = Number(inputs.x_percent ?? inputs.xPercent ?? rfNode.data?.xPercent ?? 0);
                const yPercent = Number(inputs.y_percent ?? inputs.yPercent ?? rfNode.data?.yPercent ?? 0);
                const widthPercent = Number(inputs.width_percent ?? inputs.widthPercent ?? rfNode.data?.widthPercent ?? 100);
                const heightPercent = Number(inputs.height_percent ?? inputs.heightPercent ?? rfNode.data?.heightPercent ?? 100);

                if (!imageUrl) {
                  throw new Error("No image URL provided for Crop Image node");
                }

                const result = await cropImageFF({
                  imageUrl,
                  xPercent,
                  yPercent,
                  widthPercent,
                  heightPercent,
                });

                if (!result.success || !result.outputUrl) {
                  throw new Error(result.error || "Failed to crop image");
                }

                outputs = { outputUrl: result.outputUrl };
                break;
              }
              case "extractFrame": {
                const videoUrl =
                  (inputs.video_url as string) ??
                  (inputs.videoUrl as string) ??
                  (rfNode.data?.videoUrl as string) ??
                  (inputs.input as string) ??
                  (rfNode.data?.outputUrl as string) ??
                  "";
                const timestamp = String(inputs.timestamp ?? rfNode.data?.timestamp ?? "0");

                if (!videoUrl) {
                  throw new Error("No video URL provided for Extract Frame node");
                }

                const result = await extractFrameFF({
                  videoUrl,
                  timestamp,
                });

                if (!result.success || !result.outputUrl) {
                  throw new Error(result.error || "Failed to extract frame");
                }

                outputs = { outputUrl: result.outputUrl };
                break;
              }
              case "llm": {
                const systemPrompt =
                  (inputs.system_prompt as string) ??
                  (inputs.systemPrompt as string) ??
                  rfNode.data?.systemPrompt ??
                  "";
                const userMessage =
                  (inputs.user_message as string) ??
                  (inputs.userMessage as string) ??
                  rfNode.data?.userMessage ??
                  "";
                const model = rfNode.data?.model || "gemini-1.5-flash";

                const imagesInput = inputs.images;
                const images: string[] = Array.isArray(imagesInput)
                  ? imagesInput.filter(Boolean)
                  : imagesInput
                  ? [imagesInput]
                  : [];

                const imageCandidates = images.length
                  ? images
                  : (() => {
                      const fallbacks: any[] = [];
                      const maybeInput = inputs.input;
                      const maybeOutput = inputs.output;
                      if (Array.isArray(maybeInput)) fallbacks.push(...maybeInput);
                      else if (maybeInput) fallbacks.push(maybeInput);
                      if (Array.isArray(maybeOutput)) fallbacks.push(...maybeOutput);
                      else if (maybeOutput) fallbacks.push(maybeOutput);
                      return fallbacks.filter(Boolean);
                    })();

                const result = await runLLM({
                  model,
                  systemPrompt,
                  userMessage,
                  images: imageCandidates,
                });

                if (!result.success) {
                  throw new Error(result.error || "LLM execution failed");
                }

                outputs = { output: result.output, model: result.model || model };
                break;
              }
              default: {
                outputs = { output: rfNode.data?.output ?? rfNode.data };
              }
            }

            if (outputs) {
              nodeOutputs.set(nodeId, outputs);
            }

            await prisma.nodeRun.update({
              where: { id: nodeRun.id },
              data: {
                status: "SUCCESS",
                outputs: (outputs as any) ?? null,
                duration: Date.now() - nodeStart,
                completedAt: new Date(),
              },
            });
          } catch (err: any) {
            errorMsg = err?.message || "Execution failed";
            await prisma.nodeRun.update({
              where: { id: nodeRun.id },
              data: {
                status: "FAILED",
                error: errorMsg,
                duration: Date.now() - nodeStart,
                completedAt: new Date(),
              },
            });
            throw err;
          }
        }

        await prisma.workflowRun.update({
          where: { id: run.id },
          data: {
            status: "SUCCESS",
            duration: Date.now() - start,
            completedAt: new Date(),
          },
        });
      } catch (err: any) {
        await prisma.workflowRun.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            duration: Date.now() - start,
            completedAt: new Date(),
          },
        });
      }
    })();

    return NextResponse.json({ runId: run.id, run });
  } catch (error: any) {
    console.error("Error executing workflow:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to execute workflow" },
      { status: 500 }
    );
  }
}
