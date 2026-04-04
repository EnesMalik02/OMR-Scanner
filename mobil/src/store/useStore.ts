import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group, Exam } from '../types';

interface StoreState {
  groups: Group[];
  exams: Exam[];
  
  // Actions
  addGroup: (name: string) => void;
  removeGroup: (id: string) => void;
  addExam: (groupId: string, title: string) => void;
  removeExam: (examId: string) => void;
  updateAnswerKey: (examId: string, answerKey: Record<string, string>) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      groups: [],
      exams: [],

      addGroup: (name) =>
        set((state) => ({
          groups: [
            ...state.groups,
            { id: generateId(), name, createdAt: Date.now() },
          ],
        })),

      removeGroup: (id) =>
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
          exams: state.exams.filter((e) => e.groupId !== id),
        })),

      addExam: (groupId, title) =>
        set((state) => ({
          exams: [
            ...state.exams,
            { id: generateId(), groupId, title, answerKey: {}, createdAt: Date.now() },
          ],
        })),

      removeExam: (examId) =>
        set((state) => ({
          exams: state.exams.filter((e) => e.id !== examId),
        })),

      updateAnswerKey: (examId, answerKey) =>
        set((state) => ({
          exams: state.exams.map((e) =>
            e.id === examId ? { ...e, answerKey } : e
          ),
        })),
    }),
    {
      name: 'omr-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
