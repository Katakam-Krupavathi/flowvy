"use client";

import { memo, useCallback, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { HttpRequestNodeData } from "@/lib/types";
import { useWorkflowStore } from "@/lib/store";
import { Globe, Play, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

function HttpRequestNode({ id, data }: NodeProps<HttpRequestNodeData>) {
  const { updateNode, nodes, edges, workflowId } = useWorkflowStore();
  const [running, setRunning] = useState(false);

  const hasUrlConnection = edges.some(
    (e) => e.target === id && e.targetHandle === "url"
  );
  const hasHeadersConnection = edges.some(
    (e) => e.target === id && e.targetHandle === "headers"
  );
  const hasBodyConnection = edges.some(
    (e) => e.target === id && e.targetHandle === "body"
  );

  const method = data.method || "GET";
  const showBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  const handleMethodChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNode(id, { method: e.target.value as any });
    },
    [id, updateNode]
  );

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNode(id, { url: e.target.value });
    },
    [id, updateNode]
  );

  const handleHeadersChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNode(id, { headers: e.target.value });
    },
    [id, updateNode]
  );

  const handleBodyChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNode(id, { body: e.target.value });
    },
    [id, updateNode]
  );

  const getInputValue = useCallback(
    (handleId: string) => {
      const edge = edges.find((e) => e.target === id && e.targetHandle === handleId);
      if (!edge) return null;
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) return null;

      if (sourceNode.data.nodeType === "text") return sourceNode.data.text;
      if (sourceNode.data.nodeType === "llm") return sourceNode.data.response;
      if (sourceNode.data.nodeType === "httpRequest") return sourceNode.data.output || sourceNode.data.response;
      return sourceNode.data.outputUrl || sourceNode.data.output || null;
    },
    [edges, nodes, id]
  );

  const handleRun = useCallback(async () => {
    setRunning(true);
    updateNode(id, { running: true });

    try {
      const resolvedUrl = hasUrlConnection ? getInputValue("url") : data.url;
      const resolvedHeaders = hasHeadersConnection ? getInputValue("headers") : data.headers;
      const resolvedBody = hasBodyConnection ? getInputValue("body") : data.body;

      if (!resolvedUrl) {
        throw new Error("URL is required");
      }

      const response = await fetch("/api/execute/http-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: resolvedUrl,
          method,
          headers: resolvedHeaders || undefined,
          body: showBody ? resolvedBody || undefined : undefined,
          workflowId: workflowId || undefined,
          nodeId: id,
        }),
      });

      const result = await response.json();
      if (result.success) {
        updateNode(id, {
          output: result.output,
          status: result.status,
          response: result.output,
          running: false,
        });
      } else {
        throw new Error(result.error || `HTTP request failed with status ${result.status}`);
      }
    } catch (err: any) {
      updateNode(id, {
        output: `Error: ${err.message}`,
        response: `Error: ${err.message}`,
        status: 500,
        running: false,
      });
    } finally {
      setRunning(false);
    }
  }, [id, data, hasUrlConnection, hasHeadersConnection, hasBodyConnection, method, showBody, getInputValue, updateNode, workflowId]);

  const isRunning = running || data.running;

  return (
    <div
      className={`bg-[#1a1a1a] border-2 ${
        isRunning ? "border-[#06b6d4] node-running" : "border-[#333]"
      } rounded-lg p-4 min-w-[360px] shadow-lg`}
    >
      <div className="text-white font-semibold mb-3 text-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400" />
          HTTP Request
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 font-bold">
          {method}
        </span>
      </div>

      <div className="space-y-3">
        {/* Method & URL */}
        <div className="flex gap-2">
          <select
            value={method}
            onChange={handleMethodChange}
            className="w-24 px-2 py-1.5 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs font-semibold focus:outline-none focus:border-cyan-500"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <div className="flex-1 relative">
            <input
              type="text"
              value={data.url || ""}
              onChange={handleUrlChange}
              disabled={hasUrlConnection}
              placeholder="https://api.example.com/data"
              className={`w-full px-2.5 py-1.5 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs ${
                hasUrlConnection ? "opacity-50 cursor-not-allowed" : ""
              } focus:outline-none focus:border-cyan-500`}
            />
          </div>
        </div>

        <Handle
          type="target"
          position={Position.Left}
          id="url"
          className="w-3 h-3 bg-cyan-400"
          style={{ top: 56 }}
        />

        {/* Headers */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">
              Headers (JSON or Key: Value)
            </label>
            {hasHeadersConnection && <span className="text-green-400 text-[10px]">● Connected</span>}
          </div>
          <textarea
            value={typeof data.headers === "string" ? data.headers : ""}
            onChange={handleHeadersChange}
            disabled={hasHeadersConnection}
            placeholder='{"Authorization": "Bearer token"}'
            className={`w-full h-14 px-2.5 py-1 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs font-mono resize-none ${
              hasHeadersConnection ? "opacity-50 cursor-not-allowed" : ""
            } focus:outline-none focus:border-cyan-500`}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="headers"
            className="w-3 h-3 bg-cyan-400"
            style={{ top: 110 }}
          />
        </div>

        {/* Body (if applicable) */}
        {showBody && (
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400">Request Body</label>
              {hasBodyConnection && <span className="text-green-400 text-[10px]">● Connected</span>}
            </div>
            <textarea
              value={data.body || ""}
              onChange={handleBodyChange}
              disabled={hasBodyConnection}
              placeholder='{"query": "example"}'
              className={`w-full h-16 px-2.5 py-1 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs font-mono resize-none ${
                hasBodyConnection ? "opacity-50 cursor-not-allowed" : ""
              } focus:outline-none focus:border-cyan-500`}
            />
            <Handle
              type="target"
              position={Position.Left}
              id="body"
              className="w-3 h-3 bg-cyan-400"
              style={{ top: 175 }}
            />
          </div>
        )}

        <button
          onClick={handleRun}
          disabled={isRunning || (!data.url && !hasUrlConnection)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-[#444] disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors shadow"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Sending Request...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              Send Request
            </>
          )}
        </button>

        {/* Response Status & Output */}
        {data.output && (
          <div className="mt-2 p-2.5 bg-[#0a0a0a] border border-[#333] rounded">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-400 font-medium">Response</span>
              {data.status && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                    data.status >= 200 && data.status < 300
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
                      : "bg-red-950 text-red-400 border border-red-800/40"
                  }`}
                >
                  HTTP {data.status}
                </span>
              )}
            </div>
            <pre className="text-white text-[11px] font-mono max-h-36 overflow-y-auto whitespace-pre-wrap break-all bg-[#121212] p-2 rounded">
              {data.output}
            </pre>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="w-3 h-3 bg-cyan-400"
      />
    </div>
  );
}

export default memo(HttpRequestNode);
