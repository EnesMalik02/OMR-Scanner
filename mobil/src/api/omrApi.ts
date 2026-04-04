import axios from 'axios';
import { Platform } from 'react-native';
import { BackendSchema, ScanResult } from '../types';

// Android Emulator uses 10.0.2.2 for localhost, iOS uses 127.0.0.1
export const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const fetchSchema = async (): Promise<BackendSchema> => {
  try {
    const response = await api.get<BackendSchema>('/schema');
    return response.data;
  } catch (error) {
    console.error('Error fetching schema:', error);
    throw error;
  }
};

export const processForm = async (imageUri: string): Promise<ScanResult> => {
  try {
    const formData = new FormData();

    // Append image to form data
    const filename = imageUri.split('/').pop() || 'photo.jpg';

    // We cast to any because TS's fetch/axios FormData types don't always align with RN exactly
    // In React Native, FormData accepts an object with uri, type, and name
    formData.append('file', {
      uri: Platform.OS === 'ios' ? imageUri.replace('file://', '') : imageUri,
      name: filename,
      type: 'image/jpeg',
    } as any);

    const response = await api.post<ScanResult>('/process', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  } catch (error: any) {
    console.error('Error processing form:', error);
    if (error.response) {
      // Return the error from the backend instead of breaking
      return { status: 'error', error: error.response.data.error || 'Server error', answers: {}, student_info: { name: '', student_number: '' }, metadata: {} };
    }
    throw error;
  }
};
