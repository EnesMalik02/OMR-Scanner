export interface StudentResult {
  id: string;
  name: string;
  studentNumber: string;
  correct: number;
  wrong: number;
  blank: number;
  score: number;
  answers: Record<string, string>;
  scannedAt: number;
  pending?: boolean; // taranıyor durumu
}

export interface Group {
  id: string;
  name: string;
  questionCount: number;
  answerKey: Record<string, string>;
  results?: StudentResult[];
  createdAt: number;
}


export interface ScanResult {
  status: string;
  student_info: {
    name: string;
    student_number: string;
  };
  answers: Record<string, string>;
  metadata: any;
  error?: string;
}

export type Exam = Group;
