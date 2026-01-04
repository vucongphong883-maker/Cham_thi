import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResponse, Option } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

// Schema for grading student sheet (includes box_2d)
const commonSchema = {
  type: Type.OBJECT,
  properties: {
    answers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionNumber: { type: Type.INTEGER },
          answer: { 
            type: Type.STRING,
            nullable: true
          },
          box_2d: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: "Bounding box of the detected answer mark [ymin, xmin, ymax, xmax] on a 0-1000 scale.",
            nullable: true
          }
        },
        required: ["questionNumber", "answer"],
      },
    },
  },
};

// New Schema for Answer Key auto-detection
const scanKeySchema = {
  type: Type.OBJECT,
  properties: {
    totalQuestions: { type: Type.INTEGER, description: "The total number of questions found in the answer key." },
    optionCount: { type: Type.INTEGER, description: "Number of options per question, e.g., 4 for A-D, 5 for A-E." },
    answers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionNumber: { type: Type.INTEGER },
          answer: { type: Type.STRING, nullable: true }
        }
      }
    }
  }
};

interface ParsedAnswer {
    answer: Option;
    box2d: number[] | null;
}

export interface ScannedKeyResult {
    answers: Record<number, Option>;
    config: {
        questionCount: number;
        optionCount: number;
    };
}

const parseGeminiResponse = (text: string, questionCount: number, validOptions: string[]): Record<number, ParsedAnswer> => {
  try {
    const data = JSON.parse(text) as AnalysisResponse;
    const answersMap: Record<number, ParsedAnswer> = {};
    
    // Initialize all questions with null default
    for(let i=1; i<=questionCount; i++) {
        answersMap[i] = { answer: null, box2d: null };
    }

    if (data.answers && Array.isArray(data.answers)) {
      data.answers.forEach((item) => {
        if (item.questionNumber >= 1 && item.questionNumber <= questionCount) {
          if (item.answer) {
            const val = item.answer.trim().toUpperCase();
            if (validOptions.includes(val)) {
                answersMap[item.questionNumber] = {
                    answer: val as Option,
                    box2d: item.box_2d || null
                };
            }
          }
        }
      });
    }
    return answersMap;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return {};
  }
};

export const scanAnswerKey = async (imageFile: File): Promise<ScannedKeyResult> => {
  try {
    const base64Data = await fileToBase64(imageFile);

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: imageFile.type, data: base64Data } },
          {
            text: `Analyze this image which contains the Answer Key (correct answers) for a multiple choice test.
            1. Detect the total number of questions present in the list (count them).
            2. Detect the number of options per question (e.g. 4 if A-D, 5 if A-E).
            3. Extract the correct option for each question.
            
            Return JSON with 'totalQuestions', 'optionCount', and the list of 'answers'.
            `,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: scanKeySchema,
      },
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    
    const simpleMap: Record<number, Option> = {};
    if (data.answers && Array.isArray(data.answers)) {
        data.answers.forEach((item: any) => {
            if (item.questionNumber && item.answer) {
                 simpleMap[item.questionNumber] = item.answer.trim().toUpperCase();
            }
        });
    }

    // Fallback logic if detection is zero or missing
    let totalQ = data.totalQuestions;
    const maxQ = Math.max(0, ...Object.keys(simpleMap).map(k => parseInt(k)));
    
    if (!totalQ || totalQ < maxQ) {
        totalQ = maxQ;
    }
    if (!totalQ) totalQ = 40; // Default fallback

    return {
        answers: simpleMap,
        config: {
            questionCount: totalQ,
            optionCount: data.optionCount || 4
        }
    };

  } catch (error) {
    console.error("Error scanning answer key:", error);
    throw error;
  }
};

export const analyzeAnswerSheet = async (
    imageFile: File,
    questionCount: number,
    validOptions: string[]
): Promise<Record<number, ParsedAnswer>> => {
  try {
    const base64Data = await fileToBase64(imageFile);
    const optionsStr = validOptions.join(", ");

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: imageFile.type, data: base64Data } },
          {
            text: `Analyze this image of a STUDENT'S multiple-choice exam answer sheet. 
            Total Questions: ${questionCount}.
            Valid Options: ${optionsStr}.

            Identify the handwritten mark or filled bubble for questions 1 through ${questionCount}.
            If a question has multiple marks, consider it invalid (null).
            If a question is blank, mark it as null.
            
            IMPORTANT: For every detected answer, provide the 'box_2d' coordinates [ymin, xmin, ymax, xmax] on a 0-1000 scale wrapping the marked option.
            Return result as JSON.
            `,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: commonSchema,
      },
    });

    return parseGeminiResponse(response.text || "{}", questionCount, validOptions);
  } catch (error) {
    console.error("Error analyzing student sheet:", error);
    throw error;
  }
};