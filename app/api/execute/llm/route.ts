export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { runLLM } from "@/lib/tasks/llm";
import { prisma } from "@/lib/db";

const llmSchema = z.object({
  systemPrompt: z.string().optional(),
  userMessage: z.string(),
  images: z.array(z.string()).optional(),
  model: z.string().optional(),
  workflowId: z.string().optional(),
  nodeId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = llmSchema.parse(body);

    const result = await runLLM({
      model: data.model || "gemini-1.5-flash",
      systemPrompt: data.systemPrompt,
      userMessage: data.userMessage,
      images: data.images,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "LLM execution failed" },
        { status: 500 }
      );
    }

    // If workflowId and nodeId provided, record in history
    try {
      if (data.workflowId && data.nodeId) {
        const user = await prisma.user.findUnique({
          where: { clerkId: userId },
        });

        if (user) {
          const run = await prisma.workflowRun.create({
            data: {
              workflowId: data.workflowId,
              userId: user.id,
              status: "RUNNING",
              scope: "SINGLE",
              selectedNodes: [data.nodeId],
            },
          });
          const nodeRun = await prisma.nodeRun.create({
            data: {
              runId: run.id,
              nodeId: data.nodeId,
              nodeType: "llm",
              status: "RUNNING",
              inputs: {
                system_prompt: data.systemPrompt || null,
                user_message: data.userMessage,
                images: data.images || [],
              } as any,
            },
          });
          await prisma.nodeRun.update({
            where: { id: nodeRun.id },
            data: {
              status: "SUCCESS",
              outputs: { output: result.output, model: result.model },
              duration: result.duration,
              completedAt: new Date(),
            },
          });
          await prisma.workflowRun.update({
            where: { id: run.id },
            data: {
              status: "SUCCESS",
              duration: result.duration,
              completedAt: new Date(),
            },
          });
        }
      }
    } catch (dbErr) {
      console.error("Failed to record LLM run history:", dbErr);
    }

    return NextResponse.json({
      success: true,
      output: result.output,
      model: result.model,
      duration: result.duration,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }

    return NextResponse.json(
      { error: err.message || "LLM execution failed" },
      { status: 500 }
    );
  }
}
