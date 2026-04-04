export interface Group {
  id: string;
  name: string;
  createdAt: number;
}

export interface Exam {
  id: string;
  groupId: string;
  title: string;
  answerKey: Record<string, string>; // e.g. { "1": "A", "2": "C" }
  createdAt: number;
}

export interface OptionSchema {
  val: string;
  x: number;
  y: number;
}

export interface QuestionSchema {
  q_no: number;
  options: OptionSchema[];
}

export interface BackendSchema {
  template_id: string;
  base_aspect_ratio: number;
  anchors: any[];
  fields: any[];
  questions: QuestionSchema[];
  metadata: any;
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
