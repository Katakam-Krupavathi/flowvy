"use client";

import { memo, useCallback, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { LLMNodeData, LLMProvider } from "@/lib/types";
import { useWorkflowStore } from "@/lib/store";
import { Brain, Play, Loader2, DollarSign, Sparkles } from "lucide-react";
import { useReactFlow } from "reactflow";

const PROVIDER_MODELS: Record<LLMProvider, { label: string; models: string[] }> = {
  gemini: {
    label: "Google Gemini",
    models: [
      "gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-2.0-flash",
      "gemini-1.5-pro",
    ],
  },
  openai: {
    label: "OpenAI",
    models: [
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4-turbo",
      "o1-mini",
    ],
  },
  anthropic: {
    label: "Anthropic Claude",
    models: [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
  },
};

function LLMNode({ id, data }: NodeProps<LLMNodeData>) {
  const { updateNode, nodes, edges, workflowId } = useWorkflowStore();
  const { getNode } = useReactFlow();
  const [running, setRunning] = useState(false);

  const currentProvider: LLMProvider = data.provider || "gemini";
  const currentModelList = PROVIDER_MODELS[currentProvider]?.models || PROVIDER_MODELS.gemini.models;

  // Check which handles are connected by examining edges
  const hasSystemPromptConnection = edges.some(
    (e) => e.target === id && e.targetHandle === "system_prompt"
  );
  const hasUserMessageConnection = edges.some(
    (e) => e.target === id && e.targetHandle === "user_message"
  );
  const hasImagesConnection = edges.some(
    (e) => e.target === id && e.targetHandle === "images"
  );

  const connected = {
    systemPrompt: hasSystemPromptConnection,
    userMessage: hasUserMessageConnection,
    images: hasImagesConnection,
  };

  const handleProviderChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newProvider = e.target.value as LLMProvider;
      const defaultModel = PROVIDER_MODELS[newProvider]?.models[0] || "gemini-1.5-flash";
      updateNode(id, { provider: newProvider, model: defaultModel });
    },
    [id, updateNode]
  );

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNode(id, { model: e.target.value });
    },
    [id, updateNode]
  );

  const handleSystemPromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNode(id, { systemPrompt: e.target.value });
    },
    [id, updateNode]
  );

  const handleUserMessageChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNode(id, { userMessage: e.target.value });
    },
    [id, updateNode]
  );

  const getInputValue = useCallback(
    (handleId: string) => {
      const edge = edges.find(
        (e) => e.target === id && e.targetHandle === handleId
      );
      if (!edge) return null;

      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) return null;

      if (sourceNode.data.nodeType === "text") {
        return sourceNode.data.text;
      }
      if (sourceNode.data.nodeType === "uploadImage") {
        return sourceNode.data.imageUrl;
      }
      if (sourceNode.data.nodeType === "cropImage") {
        return sourceNode.data.outputUrl;
      }
      return null;
    },
    [edges, nodes, id]
  );

  const handleRun = useCallback(async () => {
    setRunning(true);
    updateNode(id, { running: true });

    try {
      const systemPrompt = connected.systemPrompt
        ? getInputValue("system_prompt")
        : data.systemPrompt || "";
      const userMessage = connected.userMessage
        ? getInputValue("user_message")
        : data.userMessage || "";

      const imageEdges = edges.filter(
        (e) => e.target === id && e.targetHandle === "images"
      );
      const images: string[] = [];
      for (const edge of imageEdges) {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (sourceNode) {
          if (sourceNode.data.nodeType === "uploadImage" && sourceNode.data.imageUrl) {
            images.push(sourceNode.data.imageUrl);
          }
          if (sourceNode.data.nodeType === "cropImage" && sourceNode.data.outputUrl) {
            images.push(sourceNode.data.outputUrl);
          }
          if (sourceNode.data.nodeType === "extractFrame" && sourceNode.data.outputUrl) {
            images.push(sourceNode.data.outputUrl);
          }
        }
      }

      const response = await fetch("/api/execute/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: currentProvider,
          model: data.model || currentModelList[0],
          systemPrompt: systemPrompt || undefined,
          userMessage: userMessage,
          images: images.length > 0 ? images : undefined,
          workflowId: workflowId || undefined,
          nodeId: id,
        }),
      });

      const result = await response.json();
      if (result.success && result.output) {
        updateNode(id, {
          response: result.output,
          usage: result.usage,
          running: false,
        });
      } else {
        throw new Error(result.error || "Execution failed");
      }
    } catch (error: any) {
      updateNode(id, {
        response: `Error: ${error.message}`,
        running: false,
      });
    } finally {
      setRunning(false);
    }
  }, [id, data, connected, edges, nodes, getInputValue, updateNode, workflowId, currentProvider, currentModelList]);

  const isRunning = running || data.running;

  return (
    <div
      className={`bg-[#1a1a1a] border-2 ${
        isRunning ? "border-[#9333ea] node-running" : "border-[#333]"
      } rounded-lg p-4 min-w-[360px] shadow-lg`}
    >
      <div className="text-white font-semibold mb-3 text-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-[#a855f7]" />
          Run Any LLM
        </div>
        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#2a2a2a] text-purple-300 border border-purple-800/40">
          {currentProvider}
        </span>
      </div>

      <div className="space-y-3">
        {/* Provider Selector */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Provider</label>
            <select
              value={currentProvider}
              onChange={handleProviderChange}
              className="w-full px-2.5 py-1.5 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs focus:outline-none focus:border-[#9333ea]"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Model</label>
            <select
              value={data.model || currentModelList[0]}
              onChange={handleModelChange}
              className="w-full px-2.5 py-1.5 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs focus:outline-none focus:border-[#9333ea]"
            >
              {currentModelList.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Handle
          type="target"
          position={Position.Top}
          id="system_prompt"
          className="w-3 h-3 bg-[#9333ea]"
        />

        <div>
          <label className="text-xs text-gray-400 mb-1 block">
            System Prompt (Optional)
            {connected.systemPrompt && <span className="text-green-400 ml-1">● Connected</span>}
          </label>
          <textarea
            value={data.systemPrompt || ""}
            onChange={handleSystemPromptChange}
            disabled={connected.systemPrompt}
            placeholder="Optional system instructions..."
            className={`w-full h-16 px-3 py-2 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs resize-none ${
              connected.systemPrompt ? "opacity-50 cursor-not-allowed" : ""
            } focus:outline-none focus:border-[#9333ea]`}
          />
        </div>

        <Handle
          type="target"
          position={Position.Left}
          id="user_message"
          className="w-3 h-3 bg-[#9333ea]"
          style={{ top: 180 }}
        />

        <div>
          <label className="text-xs text-gray-400 mb-1 block">
            User Message (Required)
            {connected.userMessage && <span className="text-green-400 ml-1">● Connected</span>}
          </label>
          <textarea
            value={data.userMessage || ""}
            onChange={handleUserMessageChange}
            disabled={connected.userMessage}
            placeholder="Enter prompt or query..."
            className={`w-full h-20 px-3 py-2 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs resize-none ${
              connected.userMessage ? "opacity-50 cursor-not-allowed" : ""
            } focus:outline-none focus:border-[#9333ea]`}
          />
        </div>

        <Handle
          type="target"
          position={Position.Left}
          id="images"
          className="w-3 h-3 bg-[#9333ea]"
          style={{ top: 230 }}
        />

        {connected.images && (
          <div className="text-xs text-green-400">● Images Connected</div>
        )}

        <button
          onClick={handleRun}
          disabled={isRunning || (!data.userMessage && !connected.userMessage)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#9333ea] hover:bg-[#a855f7] disabled:bg-[#555] disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shadow"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running LLM...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Node
            </>
          )}
        </button>

        {data.usage && (
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              {data.usage.totalTokens} tokens
            </span>
            {data.usage.estimatedCost !== undefined && (
              <span className="text-emerald-400 font-mono">
                ${data.usage.estimatedCost.toFixed(6)}
              </span>
            )}
          </div>
        )}

        {data.response && (
          <div className="mt-3 p-3 bg-[#0a0a0a] border border-[#333] rounded">
            <div className="text-xs text-gray-400 mb-1">Response:</div>
            <div className="text-white text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
              {data.response}
            </div>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="w-3 h-3 bg-[#9333ea]"
      />
    </div>
  );
}

export default memo(LLMNode);

