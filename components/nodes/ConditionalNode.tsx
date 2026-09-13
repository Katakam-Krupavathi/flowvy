"use client";

import { memo, useCallback } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { ConditionalNodeData, ConditionOperator } from "@/lib/types";
import { useWorkflowStore } from "@/lib/store";
import { evaluateCondition } from "@/lib/tasks/conditional";
import { GitBranch, Check, X } from "lucide-react";

const OPERATORS: Array<{ value: ConditionOperator; label: string }> = [
  { value: "equals", label: "Equals (=)" },
  { value: "not_equals", label: "Not Equals (≠)" },
  { value: "contains", label: "Contains text" },
  { value: "not_contains", label: "Does not contain" },
  { value: "greater_than", label: "Greater than (>)" },
  { value: "less_than", label: "Less than (<)" },
  { value: "is_empty", label: "Is empty" },
  { value: "is_not_empty", label: "Is not empty" },
];

function ConditionalNode({ id, data }: NodeProps<ConditionalNodeData>) {
  const { updateNode, nodes, edges } = useWorkflowStore();

  const hasValueConnection = edges.some(
    (e) => e.target === id && e.targetHandle === "value"
  );
  const hasCompareConnection = edges.some(
    (e) => e.target === id && e.targetHandle === "compareValue"
  );

  const operator = data.operator || "equals";
  const hideCompare = operator === "is_empty" || operator === "is_not_empty";

  const getInputValue = useCallback(
    (handleId: string) => {
      const edge = edges.find((e) => e.target === id && e.targetHandle === handleId);
      if (!edge) return null;
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) return null;

      if (sourceNode.data.nodeType === "text") return sourceNode.data.text;
      if (sourceNode.data.nodeType === "llm") return sourceNode.data.response;
      if (sourceNode.data.nodeType === "httpRequest") return sourceNode.data.output || sourceNode.data.response;
      if (sourceNode.data.nodeType === "conditional") return sourceNode.data.output ?? sourceNode.data.value;
      return sourceNode.data.outputUrl || sourceNode.data.output || null;
    },
    [edges, nodes, id]
  );

  const handleOperatorChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newOp = e.target.value as ConditionOperator;
      updateNode(id, { operator: newOp });
    },
    [id, updateNode]
  );

  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNode(id, { value: e.target.value });
    },
    [id, updateNode]
  );

  const handleCompareValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNode(id, { compareValue: e.target.value });
    },
    [id, updateNode]
  );

  const handleEvaluate = useCallback(() => {
    const resolvedVal = hasValueConnection ? getInputValue("value") : data.value;
    const resolvedComp = hasCompareConnection ? getInputValue("compareValue") : data.compareValue;

    const evaluation = evaluateCondition({
      value: resolvedVal,
      operator,
      compareValue: resolvedComp,
    });

    updateNode(id, {
      result: evaluation.result,
      output: String(resolvedVal || ""),
    });
  }, [id, data, hasValueConnection, hasCompareConnection, operator, getInputValue, updateNode]);

  const hasEvaluated = typeof data.result === "boolean";

  return (
    <div className="bg-[#1a1a1a] border-2 border-[#eab308] rounded-lg p-4 min-w-[340px] shadow-lg">
      <div className="text-white font-semibold mb-3 text-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-yellow-400" />
          Condition / Branch
        </div>
        {hasEvaluated && (
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
              data.result
                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
                : "bg-amber-950 text-amber-400 border border-amber-800/40"
            }`}
          >
            {data.result ? (
              <>
                <Check className="w-3 h-3" /> TRUE
              </>
            ) : (
              <>
                <X className="w-3 h-3" /> FALSE
              </>
            )}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {/* Value Input */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Input Value</label>
            {hasValueConnection && <span className="text-green-400 text-[10px]">● Connected</span>}
          </div>
          <input
            type="text"
            value={data.value || ""}
            onChange={handleValueChange}
            disabled={hasValueConnection}
            placeholder="Value to test..."
            className={`w-full px-2.5 py-1.5 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs ${
              hasValueConnection ? "opacity-50 cursor-not-allowed" : ""
            } focus:outline-none focus:border-yellow-500`}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="value"
            className="w-3 h-3 bg-yellow-400"
            style={{ top: 28 }}
          />
        </div>

        {/* Operator Selector */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Condition Operator</label>
          <select
            value={operator}
            onChange={handleOperatorChange}
            className="w-full px-2.5 py-1.5 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs font-medium focus:outline-none focus:border-yellow-500"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>

        {/* Comparison Target Value */}
        {!hideCompare && (
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400">Compare With</label>
              {hasCompareConnection && <span className="text-green-400 text-[10px]">● Connected</span>}
            </div>
            <input
              type="text"
              value={data.compareValue || ""}
              onChange={handleCompareValueChange}
              disabled={hasCompareConnection}
              placeholder="Expected target value..."
              className={`w-full px-2.5 py-1.5 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs ${
                hasCompareConnection ? "opacity-50 cursor-not-allowed" : ""
              } focus:outline-none focus:border-yellow-500`}
            />
            <Handle
              type="target"
              position={Position.Left}
              id="compareValue"
              className="w-3 h-3 bg-yellow-400"
              style={{ top: 28 }}
            />
          </div>
        )}

        <button
          onClick={handleEvaluate}
          className="w-full py-1.5 px-3 bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-500/40 text-yellow-300 text-xs font-medium rounded transition-colors"
        >
          Evaluate Condition
        </button>

        {/* Branch Output Handles info */}
        <div className="pt-2 border-t border-[#333] flex justify-between text-[11px] font-semibold">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            True Branch
          </div>
          <div className="flex items-center gap-1.5 text-amber-400">
            False Branch
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          </div>
        </div>
      </div>

      {/* True Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="w-3.5 h-3.5 bg-emerald-500 !left-[25%]"
      />

      {/* False Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="w-3.5 h-3.5 bg-amber-500 !left-[75%]"
      />
    </div>
  );
}

export default memo(ConditionalNode);
