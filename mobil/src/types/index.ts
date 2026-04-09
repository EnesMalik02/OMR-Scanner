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
  pending?: boolean;
  formImagePath?: string; // işlenmiş form görselinin yerel yolu
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
  form_image_base64?: string; // transit — processForm tarafından diske kaydedilir
  formImagePath?: string;     // diske kaydedildikten sonra set edilir
}

export type Exam = Group;
