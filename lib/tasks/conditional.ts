import { ConditionOperator } from "../types";

export interface EvaluateConditionPayload {
  value: any;
  operator: ConditionOperator;
  compareValue?: any;
}

export interface EvaluateConditionResult {
  result: boolean;
  matchedBranch: "true" | "false";
  value: any;
}

/**
 * Evaluates a condition against input values and determines the matching branch
 */
export function evaluateCondition(payload: EvaluateConditionPayload): EvaluateConditionResult {
  const { value, operator, compareValue } = payload;
  const strValue = value !== undefined && value !== null ? String(value) : "";
  const strCompare = compareValue !== undefined && compareValue !== null ? String(compareValue) : "";

  let result = false;

  switch (operator) {
    case "equals": {
      // Try numeric comparison first if both are valid numbers
      const numVal = Number(strValue);
      const numComp = Number(strCompare);
      if (!isNaN(numVal) && !isNaN(numComp) && strValue.trim() !== "" && strCompare.trim() !== "") {
        result = numVal === numComp;
      } else {
        result = strValue.trim().toLowerCase() === strCompare.trim().toLowerCase();
      }
      break;
    }
    case "not_equals": {
      const numVal = Number(strValue);
      const numComp = Number(strCompare);
      if (!isNaN(numVal) && !isNaN(numComp) && strValue.trim() !== "" && strCompare.trim() !== "") {
        result = numVal !== numComp;
      } else {
        result = strValue.trim().toLowerCase() !== strCompare.trim().toLowerCase();
      }
      break;
    }
    case "contains": {
      result = strValue.toLowerCase().includes(strCompare.toLowerCase());
      break;
    }
    case "not_contains": {
      result = !strValue.toLowerCase().includes(strCompare.toLowerCase());
      break;
    }
    case "greater_than": {
      const numVal = Number(strValue);
      const numComp = Number(strCompare);
      result = !isNaN(numVal) && !isNaN(numComp) ? numVal > numComp : strValue > strCompare;
      break;
    }
    case "less_than": {
      const numVal = Number(strValue);
      const numComp = Number(strCompare);
      result = !isNaN(numVal) && !isNaN(numComp) ? numVal < numComp : strValue < strCompare;
      break;
    }
    case "is_empty": {
      result = strValue.trim() === "";
      break;
    }
    case "is_not_empty": {
      result = strValue.trim() !== "";
      break;
    }
    default: {
      result = false;
    }
  }

  return {
    result,
    matchedBranch: result ? "true" : "false",
    value,
  };
}
