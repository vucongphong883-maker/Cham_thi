
export type Option = string | null;

export interface ExamConfig {
  questionCount: number;
  optionCount: number; // 4 for A-D, 5 for A-E
  maxScore: number;    // e.g. 10 or 100
}

export interface QuestionData {
  id: number;
  selectedOption: Option;
}

export interface StudentResult {
  questionId: number;
  studentAnswer: Option;
  correctAnswer: Option;
  isCorrect: boolean;
  box2d?: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

export interface GradingSummary {
  totalQuestions: number;
  correctCount?: number;
  score?: number; 
  maxScore?: number; // The scale used for grading
  results: StudentResult[];
  imageUrl?: string; // Store the image url for overlay display
}

export interface AnalysisResponse {
  answers: { 
      questionNumber: number; 
      answer: string;
      box_2d?: number[];
  }[];
}
