export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { executeHttpRequest } from "@/lib/tasks/http-request";
import { prisma } from "@/lib/db";

const httpRequestSchema = z.object({
  url: z.string(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional(),
  headers: z.union([z.string(), z.record(z.string())]).optional(),
  body: z.union([z.string(), z.record(z.any())]).optional(),
  timeout: z.number().optional(),
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
    const data = httpRequestSchema.parse(body);

    const result = await executeHttpRequest({
      url: data.url,
      method: data.method,
      headers: data.headers,
      body: data.body,
      timeout: data.timeout,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "HTTP request execution failed", status: result.status },
        { status: result.status && result.status >= 400 && result.status < 600 ? result.status : 500 }
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
              nodeType: "httpRequest",
              status: "RUNNING",
              inputs: {
                url: data.url,
                method: data.method || "GET",
                headers: data.headers || null,
                body: data.body || null,
              } as any,
            },
          });
          await prisma.nodeRun.update({
            where: { id: nodeRun.id },
            data: {
              status: "SUCCESS",
              outputs: {
                output: result.output,
                status: result.status,
                headers: result.headers,
                data: result.data,
              },
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
      console.error("Failed to record HTTP Request run history:", dbErr);
    }

    return NextResponse.json({
      success: true,
      output: result.output,
      data: result.data,
      status: result.status,
      headers: result.headers,
      duration: result.duration,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }

    return NextResponse.json(
      { error: err.message || "HTTP request execution failed" },
      { status: 500 }
    );
  }
}
