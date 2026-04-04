import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, PermissionsAndroid, Platform } from 'react-native';
import { useStore } from '../store/useStore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import ImagePicker from 'react-native-image-crop-picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { API_BASE_URL } from '../api/omrApi';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetail'>;

export const GroupDetailScreen = ({ route, navigation }: Props) => {
  const { groupId } = route.params;
  const [newExamTitle, setNewExamTitle] = useState('');
  const { exams, addExam, removeExam } = useStore();

  const groupExams = exams.filter(e => e.groupId === groupId);

  const handleAddExam = () => {
    if (!newExamTitle.trim()) return;
    addExam(groupId, newExamTitle.trim());
    setNewExamTitle('');
  };

  const handleScan = (exam: any) => {
    ImagePicker.openCamera({
      cropping: false,
      compressImageQuality: 0.7,
      mediaType: 'photo'
    }).then(image => {
      navigation.navigate('ScanResult', { exam, imageUri: image.path });
    }).catch(e => {
      if (e.message !== 'User cancelled image selection') {
        Alert.alert('Kamera Hatası', e.message);
      }
    });
  };

  const handleDownloadForm = async () => {
    try {
      if (Platform.OS === 'android') {
        const permission = Number(Platform.Version) >= 33 
          ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          : PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
        const granted = await PermissionsAndroid.request(permission);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('İzin Reddedildi', 'Galeriye kaydetmek için depolama izni gereklidir.');
          return;
        }
      }

      const dirs = ReactNativeBlobUtil.fs.dirs;
      const tempFileUrl = `${dirs.DocumentDir}/optik_form_${Date.now()}.png`;

      const downloadResult = await ReactNativeBlobUtil.config({
        fileCache: true,
        path: tempFileUrl,
      }).fetch('GET', `${API_BASE_URL}/generate_form`);

      if (downloadResult.info().status === 200) {
        await CameraRoll.save(`file://${downloadResult.path()}`, { type: 'photo' });
        Alert.alert('Başarılı', 'Optik form galerisine (Fotoğraflar) kaydedildi!');
      } else {
        Alert.alert('Hata', 'Form indirilirken bir sorun oluştu.');
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Resim kaydedilemedi.');
    }
  };

  const renderExamItem = ({ item }: { item: any }) => (
    <View style={styles.examCard}>
      <View style={styles.examHeader}>
        <Text style={styles.examTitle}>{item.title}</Text>
        <TouchableOpacity onPress={() => removeExam(item.id)}>
          <Text style={styles.deleteText}>Sil</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.actionRow}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => navigation.navigate('ExamConfig', { exam: item })}
        >
          <Text style={styles.actionText}>Cevap Anahtarı</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.scanButton]}
          onPress={() => handleScan(item)}
        >
          <Text style={styles.scanText}>Tara</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={styles.downloadButton}
        onPress={handleDownloadForm}
      >
        <Text style={styles.downloadText}>Formu Galerime İndir</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Yeni Sınav Adı (Örn: Matematik 1. Dönem)"
          value={newExamTitle}
          onChangeText={setNewExamTitle}
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddExam}>
          <Text style={styles.addButtonText}>Oluştur</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={groupExams}
        keyExtractor={(item) => item.id}
        renderItem={renderExamItem}
        ListEmptyComponent={<Text style={styles.emptyText}>Bu gruba ait henüz optik sınav oluşturulmadı.</Text>}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  inputContainer: { flexDirection: 'row', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  input: { flex: 1, height: 48, backgroundColor: '#f0f0f0', borderRadius: 8, paddingHorizontal: 16, marginRight: 12 },
  addButton: { backgroundColor: '#f4511e', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, borderRadius: 8 },
  addButtonText: { color: '#fff', fontWeight: 'bold' },
  listContainer: { padding: 16 },
  examCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  examHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  examTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  deleteText: { color: '#ff4444', fontWeight: 'bold' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1, backgroundColor: '#f0f0f0', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  actionText: { color: '#333', fontWeight: 'bold' },
  scanButton: { backgroundColor: '#f4511e' },
  scanText: { color: '#fff', fontWeight: 'bold' },
  downloadButton: { marginTop: 10, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#f4511e' },
  downloadText: { color: '#f4511e', fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40 }
});
