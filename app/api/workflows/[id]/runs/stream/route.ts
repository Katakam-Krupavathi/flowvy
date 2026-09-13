export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { subscribeWorkflowEvents, WorkflowEvent } from "@/lib/events";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const workflowId = params.id;

    // Verify workflow belongs to user
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        userId: user.id,
      },
    });

    if (!workflow) {
      return new Response("Workflow not found", { status: 404 });
    }

    // Set up SSE stream
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    let heartbeatTimer: NodeJS.Timeout | null = null;

    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection event
        controller.enqueue(
          encoder.encode(`event: connected\ndata: ${JSON.stringify({ workflowId, connected: true })}\n\n`)
        );

        // Heartbeat ping every 15s to keep connection alive
        heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
          }
        }, 15000);

        // Subscribe to live workflow execution events
        unsubscribe = subscribeWorkflowEvents(workflowId, (event: WorkflowEvent) => {
          try {
            const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch (err) {
            console.error("Error sending SSE event:", err);
          }
        });
      },
      cancel() {
        if (unsubscribe) unsubscribe();
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Encoding": "none",
      },
    });
  } catch (error: any) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}
