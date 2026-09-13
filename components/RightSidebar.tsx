"use client";

import { useWorkflowStore } from "@/lib/store";
import { X, Clock, CheckCircle, XCircle, AlertCircle, Sparkles, DollarSign, Activity } from "lucide-react";
import { useEffect, useMemo } from "react";
import { WorkflowRun, NodeRun } from "@/lib/types";

function extractUsage(outputs: any) {
  if (!outputs) return null;
  if (typeof outputs === "object" && outputs.usage) {
    return outputs.usage;
  }
  return null;
}

function calculateRunUsage(nodeRuns?: NodeRun[]) {
  if (!nodeRuns || nodeRuns.length === 0) {
    return { totalTokens: 0, totalCost: 0 };
  }

  let totalTokens = 0;
  let totalCost = 0;

  for (const nr of nodeRuns) {
    const usage = extractUsage(nr.outputs);
    if (usage) {
      totalTokens += Number(usage.totalTokens || 0);
      totalCost += Number(usage.estimatedCost || 0);
    }
  }

  return { totalTokens, totalCost };
}

export default function RightSidebar() {
  const {
    rightSidebarOpen,
    toggleRightSidebar,
    runs,
    selectedRun,
    setSelectedRun,
    workflowId,
    setRuns,
  } = useWorkflowStore();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "FAILED":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "RUNNING":
        return <AlertCircle className="w-4 h-4 text-yellow-500 animate-pulse" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "-";
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getScopeLabel = (scope: string) => {
    switch (scope) {
      case "FULL":
        return "Full Workflow";
      case "PARTIAL":
        return "Selected Nodes";
      case "SINGLE":
        return "Single Node";
      default:
        return scope;
    }
  };

  // Compute lifetime metrics across all workflow runs
  const lifetimeMetrics = useMemo(() => {
    let totalTokens = 0;
    let totalCost = 0;
    for (const run of runs) {
      const { totalTokens: t, totalCost: c } = calculateRunUsage(run.nodeRuns);
      totalTokens += t;
      totalCost += c;
    }
    return {
      totalRuns: runs.length,
      totalTokens,
      totalCost,
    };
  }, [runs]);

  useEffect(() => {
    let interval: any;
    const fetchRuns = async () => {
      if (!workflowId) return;
      try {
        const res = await fetch(`/api/workflows/${workflowId}/runs`);
        const data = await res.json();
        if (data.runs) {
          setRuns(data.runs);
        }
      } catch (e) {
        // ignore
      }
    };
    // Initial fetch
    fetchRuns();
    // Poll while sidebar open
    if (rightSidebarOpen && workflowId) {
      interval = setInterval(fetchRuns, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [workflowId, rightSidebarOpen, setRuns]);

  return (
    <div
      className={`${
        rightSidebarOpen ? "w-80" : "w-0"
      } bg-[#1a1a1a] border-l border-[#333] transition-all duration-300 flex flex-col h-screen overflow-hidden`}
    >
      {rightSidebarOpen && (
        <>
          <div className="p-4 border-b border-[#333] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <h2 className="text-white font-semibold">Workflow History</h2>
            </div>
            <button
              onClick={toggleRightSidebar}
              className="text-gray-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Running Totals / Lifetime Usage Header */}
          <div className="p-3 bg-[#111] border-b border-[#2a2a2a] grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[#1f1f1f] p-2 rounded border border-[#333]">
              <div className="text-gray-400 text-[10px] flex items-center gap-1 mb-0.5">
                <Sparkles className="w-3 h-3 text-purple-400" />
                Total Tokens
              </div>
              <div className="text-white font-semibold font-mono">
                {lifetimeMetrics.totalTokens.toLocaleString()}
              </div>
            </div>

            <div className="bg-[#1f1f1f] p-2 rounded border border-[#333]">
              <div className="text-gray-400 text-[10px] flex items-center gap-1 mb-0.5">
                <DollarSign className="w-3 h-3 text-emerald-400" />
                Estimated Cost
              </div>
              <div className="text-emerald-400 font-semibold font-mono">
                ${lifetimeMetrics.totalCost.toFixed(6)}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {selectedRun ? (
              <div>
                <button
                  onClick={() => setSelectedRun(null)}
                  className="mb-4 text-xs font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1"
                >
                  ← Back to runs
                </button>
                <div className="space-y-4">
                  <div className="bg-[#121212] p-3 rounded-lg border border-[#2a2a2a]">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-white font-semibold text-sm">
                        Run #{selectedRun.id.slice(-6)}
                      </h3>
                      {getStatusIcon(selectedRun.status)}
                    </div>
                    <div className="text-xs text-gray-400 mb-2">
                      {formatDate(selectedRun.startedAt)} • {getScopeLabel(selectedRun.scope)} • {formatDuration(selectedRun.duration)}
                    </div>

                    {/* Run usage summary */}
                    {(() => {
                      const runUsage = calculateRunUsage(selectedRun.nodeRuns);
                      return (
                        <div className="flex items-center justify-between pt-2 border-t border-[#2a2a2a] text-[11px]">
                          <span className="text-gray-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-purple-400" />
                            {runUsage.totalTokens.toLocaleString()} tokens
                          </span>
                          <span className="text-emerald-400 font-mono font-semibold">
                            ${runUsage.totalCost.toFixed(6)}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-white text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Node Executions ({selectedRun.nodeRuns?.length || 0})
                    </h4>
                    {selectedRun.nodeRuns?.map((nodeRun) => {
                      const usage = extractUsage(nodeRun.outputs);
                      return (
                        <div key={nodeRun.id} className="bg-[#242424] p-3 rounded-lg border border-[#333]">
                          <div className="flex items-center gap-2 mb-1">
                            {getStatusIcon(nodeRun.status)}
                            <span className="text-white text-xs font-semibold">
                              {nodeRun.nodeType}
                            </span>
                            <span className="text-[10px] text-gray-500 ml-auto font-mono">
                              {formatDuration(nodeRun.duration)}
                            </span>
                          </div>

                          {/* Usage metrics for LLM or other nodes */}
                          {usage && (
                            <div className="my-2 p-1.5 bg-[#181818] rounded border border-[#333] flex items-center justify-between text-[10px]">
                              <span className="text-purple-300">
                                {usage.totalTokens || 0} tokens
                              </span>
                              {usage.estimatedCost !== undefined && (
                                <span className="text-emerald-400 font-mono">
                                  ${usage.estimatedCost.toFixed(6)}
                                </span>
                              )}
                            </div>
                          )}

                          {nodeRun.outputs && (
                            <div className="mt-2 text-[11px] text-gray-400">
                              <div className="font-medium text-gray-500 mb-0.5">Output:</div>
                              <div className="break-all max-h-24 overflow-y-auto font-mono bg-[#181818] p-1.5 rounded text-[10px] text-gray-300">
                                {typeof nodeRun.outputs === "string"
                                  ? nodeRun.outputs
                                  : JSON.stringify(nodeRun.outputs, null, 2)}
                              </div>
                            </div>
                          )}
                          {nodeRun.error && (
                            <div className="mt-2 text-xs text-red-400">
                              <div className="font-medium mb-1">Error:</div>
                              <div>{nodeRun.error}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {runs.length === 0 ? (
                  <div className="text-gray-500 text-xs text-center py-8">
                    No workflow runs recorded yet
                  </div>
                ) : (
                  runs.map((run) => {
                    const usage = calculateRunUsage(run.nodeRuns);
                    return (
                      <button
                        key={run.id}
                        onClick={() => setSelectedRun(run)}
                        className="w-full text-left bg-[#242424] hover:bg-[#2d2d2d] p-3 rounded-lg border border-[#333] transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(run.status)}
                            <span className="text-white text-xs font-semibold">
                              Run #{run.id.slice(-6)}
                            </span>
                          </div>
                          {usage.totalCost > 0 && (
                            <span className="text-emerald-400 font-mono text-[10px]">
                              ${usage.totalCost.toFixed(5)}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {formatDate(run.startedAt)}
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1 flex items-center justify-between">
                          <span>{getScopeLabel(run.scope)} • {formatDuration(run.duration)}</span>
                          {usage.totalTokens > 0 && (
                            <span className="text-purple-400">
                              {usage.totalTokens.toLocaleString()} tokens
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

