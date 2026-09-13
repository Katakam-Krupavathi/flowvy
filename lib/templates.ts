import { v4 as uuidv4 } from "uuid";
import { WorkflowNode } from "./types";
import { Edge } from "reactflow";

export type TemplateCategory =
  | "AI & LLM"
  | "Media Processing"
  | "API & Webhooks"
  | "Conditional Automation";

export interface TemplateParameter {
  key: string;
  label: string;
  type: "text" | "number" | "url" | "select";
  defaultValue?: any;
  options?: string[];
  description?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  category: TemplateCategory;
  tags: string[];
  parameters?: TemplateParameter[];
  nodes: any[];
  edges: any[];
  viewport?: { x: number; y: number; zoom: number };
  createdAt?: string;
  author?: string;
}

/**
 * Curated starter templates library
 */
export const STARTER_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "template-multimodal-analyzer",
    name: "Multimodal Visual Inspection & OCR",
    description: "Upload an image, crop the region of interest using FFmpeg, and run a multimodal LLM analysis.",
    version: "1.0.0",
    category: "AI & LLM",
    tags: ["gemini", "vision", "crop", "ffmpeg"],
    author: "Flowvy Core",
    nodes: [
      {
        id: "upload-1",
        type: "uploadImage",
        position: { x: 80, y: 120 },
        data: {
          label: "Input Image",
          nodeType: "uploadImage",
          outputType: "image",
          outputTypes: { output: "image" },
        },
      },
      {
        id: "crop-2",
        type: "cropImage",
        position: { x: 380, y: 120 },
        data: {
          label: "Crop Region",
          nodeType: "cropImage",
          xPercent: 10,
          yPercent: 10,
          widthPercent: 80,
          heightPercent: 80,
          outputType: "image",
          outputTypes: { output: "image" },
          inputType: "image",
        },
      },
      {
        id: "llm-3",
        type: "llm",
        position: { x: 680, y: 100 },
        data: {
          label: "Vision LLM",
          nodeType: "llm",
          provider: "gemini",
          model: "gemini-1.5-flash",
          systemPrompt: "You are an expert image analyst. Inspect the cropped region and extract all visible text and key objects.",
          userMessage: "Describe the cropped visual details in structured markdown.",
          outputType: "text",
          outputTypes: { output: "text" },
          inputType: "text",
          inputTypes: {
            system_prompt: "text",
            user_message: "text",
            images: "image",
          },
        },
      },
    ],
    edges: [
      {
        id: "e-1-2",
        source: "upload-1",
        target: "crop-2",
        targetHandle: "image_url",
        style: { stroke: "#9333ea", strokeWidth: 2 },
        animated: true,
      },
      {
        id: "e-2-3",
        source: "crop-2",
        target: "llm-3",
        targetHandle: "images",
        style: { stroke: "#9333ea", strokeWidth: 2 },
        animated: true,
      },
    ],
  },
  {
    id: "template-api-ai-pipeline",
    name: "API Data Ingestion & LLM Synthesis",
    description: "Fetch live data from any REST API, pass the JSON payload into an LLM prompt, and generate an executive summary.",
    version: "1.0.0",
    category: "API & Webhooks",
    tags: ["http", "rest", "openai", "summarization"],
    author: "Flowvy Core",
    nodes: [
      {
        id: "http-1",
        type: "httpRequest",
        position: { x: 100, y: 120 },
        data: {
          label: "Fetch External API",
          nodeType: "httpRequest",
          url: "https://jsonplaceholder.typicode.com/posts/1",
          method: "GET",
          outputType: "text",
          outputTypes: { output: "text" },
        },
      },
      {
        id: "llm-2",
        type: "llm",
        position: { x: 520, y: 100 },
        data: {
          label: "Summarizer LLM",
          nodeType: "llm",
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt: "You are a concise data summarizer. Analyze incoming API payloads and generate key bullet points.",
          userMessage: "Summarize this API response:",
          outputType: "text",
          outputTypes: { output: "text" },
          inputTypes: {
            user_message: "text",
          },
        },
      },
    ],
    edges: [
      {
        id: "e-http-llm",
        source: "http-1",
        target: "llm-2",
        targetHandle: "user_message",
        style: { stroke: "#06b6d4", strokeWidth: 2 },
        animated: true,
      },
    ],
  },
  {
    id: "template-conditional-routing",
    name: "Intelligent Sentiment / Quality Router",
    description: "Evaluate incoming text against a condition (e.g. positive / urgent) and branch execution down dedicated True/False paths.",
    version: "1.0.0",
    category: "Conditional Automation",
    tags: ["branching", "logic", "routing", "automation"],
    author: "Flowvy Core",
    nodes: [
      {
        id: "text-input",
        type: "text",
        position: { x: 80, y: 160 },
        data: {
          label: "Customer Message",
          nodeType: "text",
          text: "URGENT: Server outage detected in cluster",
          outputType: "text",
          outputTypes: { output: "text" },
        },
      },
      {
        id: "cond-router",
        type: "conditional",
        position: { x: 380, y: 140 },
        data: {
          label: "Check Urgency",
          nodeType: "conditional",
          operator: "contains",
          compareValue: "URGENT",
          outputType: "text",
          outputTypes: { true: "text", false: "text" },
        },
      },
      {
        id: "llm-true",
        type: "llm",
        position: { x: 740, y: 50 },
        data: {
          label: "Emergency Escalation LLM",
          nodeType: "llm",
          provider: "anthropic",
          model: "claude-3-5-haiku-20241022",
          systemPrompt: "Draft an urgent incident report for on-call engineers.",
          userMessage: "Incident context:",
          outputType: "text",
          outputTypes: { output: "text" },
        },
      },
      {
        id: "llm-false",
        type: "llm",
        position: { x: 740, y: 280 },
        data: {
          label: "Standard Support LLM",
          nodeType: "llm",
          provider: "gemini",
          model: "gemini-1.5-flash",
          systemPrompt: "Draft a routine customer acknowledgment email.",
          userMessage: "Customer message:",
          outputType: "text",
          outputTypes: { output: "text" },
        },
      },
    ],
    edges: [
      {
        id: "e-text-cond",
        source: "text-input",
        target: "cond-router",
        targetHandle: "value",
        style: { stroke: "#eab308", strokeWidth: 2 },
        animated: true,
      },
      {
        id: "e-cond-true",
        source: "cond-router",
        sourceHandle: "true",
        target: "llm-true",
        targetHandle: "user_message",
        style: { stroke: "#10b981", strokeWidth: 2 },
        animated: true,
      },
      {
        id: "e-cond-false",
        source: "cond-router",
        sourceHandle: "false",
        target: "llm-false",
        targetHandle: "user_message",
        style: { stroke: "#f59e0b", strokeWidth: 2 },
        animated: true,
      },
    ],
  },
];

const LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY = "flowvy_custom_templates";

/**
 * Retrieves user's saved custom templates from browser storage
 */
export function getSavedCustomTemplates(): WorkflowTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Saves a new custom template into browser storage
 */
export function saveCustomTemplate(template: WorkflowTemplate): void {
  if (typeof window === "undefined") return;
  const existing = getSavedCustomTemplates();
  const filtered = existing.filter((t) => t.id !== template.id);
  filtered.unshift(template);
  localStorage.setItem(LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY, JSON.stringify(filtered));
}

/**
 * Deletes a custom template by ID
 */
export function deleteCustomTemplate(templateId: string): void {
  if (typeof window === "undefined") return;
  const existing = getSavedCustomTemplates();
  const filtered = existing.filter((t) => t.id !== templateId);
  localStorage.setItem(LOCAL_STORAGE_CUSTOM_TEMPLATES_KEY, JSON.stringify(filtered));
}

/**
 * Converts active canvas nodes and edges into a reusable, parameterized WorkflowTemplate
 */
export function exportWorkflowAsTemplate(
  name: string,
  description: string,
  category: TemplateCategory = "AI & LLM",
  nodes: WorkflowNode[],
  edges: Edge[],
  tags: string[] = []
): WorkflowTemplate {
  return {
    id: `template-${uuidv4().slice(0, 8)}`,
    name: name || "Custom Workflow Template",
    description: description || "Reusable workflow pipeline template",
    version: "1.0.0",
    category,
    tags: tags.length > 0 ? tags : ["flowvy", "template"],
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges: JSON.parse(JSON.stringify(edges)),
    createdAt: new Date().toISOString(),
    author: "You",
  };
}

/**
 * Instantiates a template onto the canvas, assigning fresh unique node and edge IDs
 */
export function instantiateTemplate(template: WorkflowTemplate): { nodes: any[]; edges: any[] } {
  const idMap = new Map<string, string>();

  const newNodes = (template.nodes || []).map((node) => {
    const newId = uuidv4();
    idMap.set(node.id, newId);
    return {
      ...node,
      id: newId,
      data: {
        ...node.data,
        running: false,
      },
    };
  });

  const newEdges = (template.edges || []).map((edge) => {
    const newSource = idMap.get(edge.source) || edge.source;
    const newTarget = idMap.get(edge.target) || edge.target;
    return {
      ...edge,
      id: uuidv4(),
      source: newSource,
      target: newTarget,
    };
  });

  return {
    nodes: newNodes,
    edges: newEdges,
  };
}
