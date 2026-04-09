import axios from 'axios';
import { Platform } from 'react-native';
import ImageResizer from 'react-native-image-resizer';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { ScanResult } from '../types';

export const API_BASE_URL = 'https://omr-scanner-jsc8.onrender.com';
// export const API_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

const api = axios.create({ baseURL: API_BASE_URL });

const FORM_IMAGES_DIR = () => `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/form_images`;

export const processForm = async (
  imageUri: string,
  questionCount: number = 20,
  signal?: AbortSignal,
): Promise<ScanResult> => {
  try {
    const resized = await ImageResizer.createResizedImage(imageUri, 1600, 2133, 'JPEG', 65, 0);

    const formData = new FormData();
    formData.append('file', {
      uri: Platform.OS === 'ios' ? resized.uri.replace('file://', '') : resized.uri,
      name: resized.name || 'photo.jpg',
      type: 'image/jpeg',
    } as any);
    formData.append('question_count', questionCount.toString());

    const response = await api.post<ScanResult>('/process', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal,
    });

    const data = response.data;

    // base64 görsel varsa diske kaydet, ScanResult'a path ekle
    if (data.form_image_base64) {
      try {
        const dir = FORM_IMAGES_DIR();
        await ReactNativeBlobUtil.fs.mkdir(dir).catch(() => {});
        const path = `${dir}/${Date.now()}.jpg`;
        await ReactNativeBlobUtil.fs.writeFile(path, data.form_image_base64, 'base64');
        data.formImagePath = path;
      } catch {}
      delete data.form_image_base64; // bellekte tutma
    }

    return data;
  } catch (error: any) {
    if (error.response) {
      return { status: 'error', error: error.response.data.error || 'Server error', answers: {}, student_info: { name: '', student_number: '' }, metadata: {} };
    }
    throw error;
  }
};
