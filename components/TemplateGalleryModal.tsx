"use client";

import { useState, useMemo } from "react";
import {
  WorkflowTemplate,
  TemplateCategory,
  STARTER_TEMPLATES,
  getSavedCustomTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  exportWorkflowAsTemplate,
  instantiateTemplate,
} from "@/lib/templates";
import { useWorkflowStore } from "@/lib/store";
import {
  X,
  Search,
  LayoutTemplate,
  Sparkles,
  Download,
  Upload,
  Plus,
  Trash2,
  Check,
  Tag,
  Layers,
} from "lucide-react";

interface TemplateGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: Array<TemplateCategory | "All" | "My Templates"> = [
  "All",
  "AI & LLM",
  "Media Processing",
  "API & Webhooks",
  "Conditional Automation",
  "My Templates",
];

export default function TemplateGalleryModal({ isOpen, onClose }: TemplateGalleryModalProps) {
  const { nodes, edges, setNodes, setEdges, workflowName } = useWorkflowStore();
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | "All" | "My Templates">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [customTemplates, setCustomTemplates] = useState<WorkflowTemplate[]>(() => getSavedCustomTemplates());
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [newTemplateCat, setNewTemplateCat] = useState<TemplateCategory>("AI & LLM");
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);

  const refreshCustomTemplates = () => {
    setCustomTemplates(getSavedCustomTemplates());
  };

  const allTemplates = useMemo(() => {
    return [...customTemplates, ...STARTER_TEMPLATES];
  }, [customTemplates]);

  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((tpl) => {
      // Category filter
      if (selectedCategory === "My Templates") {
        if (!customTemplates.some((c) => c.id === tpl.id)) return false;
      } else if (selectedCategory !== "All" && tpl.category !== selectedCategory) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = tpl.name.toLowerCase().includes(query);
        const matchesDesc = tpl.description.toLowerCase().includes(query);
        const matchesTag = tpl.tags?.some((t) => t.toLowerCase().includes(query));
        return matchesName || matchesDesc || matchesTag;
      }

      return true;
    });
  }, [allTemplates, selectedCategory, searchQuery, customTemplates]);

  const handleUseTemplate = (template: WorkflowTemplate) => {
    const { nodes: newNodes, edges: newEdges } = instantiateTemplate(template);
    setNodes(newNodes);
    setEdges(newEdges);
    setAppliedTemplateId(template.id);
    setTimeout(() => {
      setAppliedTemplateId(null);
      onClose();
    }, 600);
  };

  const handleSaveCurrentAsTemplate = () => {
    if (!newTemplateName.trim()) return;
    const template = exportWorkflowAsTemplate(
      newTemplateName,
      newTemplateDesc,
      newTemplateCat,
      nodes,
      edges,
      ["custom", newTemplateCat.toLowerCase().replace(/[^a-z0-9]/g, "-")]
    );
    saveCustomTemplate(template);
    refreshCustomTemplates();
    setShowSaveModal(false);
    setNewTemplateName("");
    setNewTemplateDesc("");
    setSelectedCategory("My Templates");
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteCustomTemplate(id);
    refreshCustomTemplates();
  };

  const handleExportTemplateJson = (template: WorkflowTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(template, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${template.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-template.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportTemplateFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.nodes && parsed.edges) {
          const imported: WorkflowTemplate = {
            id: `template-${Date.now()}`,
            name: parsed.name || "Imported Template",
            description: parsed.description || "Imported workflow template",
            version: parsed.version || "1.0.0",
            category: parsed.category || "AI & LLM",
            tags: parsed.tags || ["imported"],
            nodes: parsed.nodes,
            edges: parsed.edges,
            author: parsed.author || "Imported",
          };
          saveCustomTemplate(imported);
          refreshCustomTemplates();
          setSelectedCategory("My Templates");
        }
      } catch (err: any) {
        alert("Invalid template JSON file");
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#181818] border border-[#333] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-[#333] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-950/60 border border-purple-800/40 text-purple-400">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Workflow Template Library</h2>
              <p className="text-gray-400 text-xs">
                Jumpstart your pipeline with curated architectures or save custom templates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaveModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition-colors shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              Save Canvas as Template
            </button>

            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#333] border border-[#444] text-gray-200 text-xs font-medium rounded-lg cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              Import Template
              <input type="file" accept=".json" onChange={handleImportTemplateFile} className="hidden" />
            </label>

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#2a2a2a] transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="p-4 border-b border-[#2a2a2a] bg-[#141414] flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Category Pills */}
          <div className="flex gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? "bg-purple-600 text-white shadow"
                    : "bg-[#222] text-gray-400 hover:text-white hover:bg-[#2a2a2a]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates or tags..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#222] border border-[#333] rounded-lg text-white text-xs focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Template Cards Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-16 text-gray-500 text-sm">
              No matching workflow templates found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map((tpl) => {
                const isCustom = customTemplates.some((c) => c.id === tpl.id);
                const isApplied = appliedTemplateId === tpl.id;

                return (
                  <div
                    key={tpl.id}
                    className="bg-[#202020] border border-[#333] hover:border-purple-500/60 rounded-xl p-4 flex flex-col justify-between transition-all duration-200 hover:shadow-lg group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-semibold text-sm group-hover:text-purple-300 transition-colors">
                            {tpl.name}
                          </h3>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#2a2a2a] text-purple-300 border border-purple-800/30 whitespace-nowrap">
                          {tpl.category}
                        </span>
                      </div>

                      <p className="text-gray-400 text-xs line-clamp-2 mb-3">
                        {tpl.description}
                      </p>

                      <div className="flex flex-wrap gap-1.5 mb-4">
                        <span className="flex items-center gap-1 text-[10px] bg-[#181818] border border-[#333] text-gray-300 px-2 py-0.5 rounded">
                          <Layers className="w-3 h-3 text-purple-400" />
                          {tpl.nodes?.length || 0} nodes
                        </span>
                        {tpl.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] bg-[#181818] text-gray-400 px-1.5 py-0.5 rounded border border-[#2a2a2a]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#2a2a2a]">
                      <div className="text-[10px] text-gray-500">
                        by {tpl.author || "Community"}
                      </div>

                      <div className="flex items-center gap-2">
                        {isCustom && (
                          <button
                            onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                            className="p-1 text-gray-500 hover:text-red-400 rounded transition-colors"
                            title="Delete template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={(e) => handleExportTemplateJson(tpl, e)}
                          className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors"
                          title="Export JSON"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleUseTemplate(tpl)}
                          className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                            isApplied
                              ? "bg-emerald-600 text-white"
                              : "bg-purple-600 hover:bg-purple-500 text-white shadow"
                          }`}
                        >
                          {isApplied ? (
                            <>
                              <Check className="w-3 h-3" />
                              Loaded!
                            </>
                          ) : (
                            "Use Template"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Save Current Workflow Modal Dialog */}
        {showSaveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-[#222] border border-[#444] rounded-xl p-5 w-full max-w-md space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-sm">Save Current Canvas as Template</h3>
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Template Name</label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder={workflowName || "My Workflow Pipeline"}
                  className="w-full px-3 py-1.5 bg-[#141414] border border-[#333] rounded text-white text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Description</label>
                <textarea
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  placeholder="What does this workflow automate?"
                  className="w-full h-16 px-3 py-1.5 bg-[#141414] border border-[#333] rounded text-white text-xs resize-none focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Category</label>
                <select
                  value={newTemplateCat}
                  onChange={(e) => setNewTemplateCat(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-[#141414] border border-[#333] rounded text-white text-xs focus:outline-none focus:border-purple-500"
                >
                  <option value="AI & LLM">AI & LLM</option>
                  <option value="Media Processing">Media Processing</option>
                  <option value="API & Webhooks">API & Webhooks</option>
                  <option value="Conditional Automation">Conditional Automation</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCurrentAsTemplate}
                  disabled={!newTemplateName.trim()}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-[#444] text-white text-xs font-semibold rounded-lg transition-colors shadow"
                >
                  Save Template
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
