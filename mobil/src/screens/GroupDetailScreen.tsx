import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, PermissionsAndroid, Platform, ScrollView } from 'react-native';
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
  const { groups } = useStore();

  const group = groups.find(g => g.id === groupId);

  if (!group) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Grup bulunamadı.</Text>
      </View>
    );
  }

  const handleScan = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Kamera İzni',
            message: 'Optik formu taramak için kameranıza erişmemiz gerekiyor.',
            buttonNeutral: 'Daha Sonra',
            buttonNegative: 'İptal',
            buttonPositive: 'İzin Ver',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('İzin Reddedildi', 'Form tarayabilmek için kamera izni vermeniz gerekiyor.');
          return;
        }
      } catch (err) {
        console.warn(err);
        return;
      }
    }

    ImagePicker.openCamera({
      cropping: false,
      compressImageQuality: 0.6,
      compressImageMaxWidth: 1200,
      compressImageMaxHeight: 1600,
      mediaType: 'photo'
    }).then(image => {
      // route parametresindeki exam alanına group yolluyoruz
      navigation.navigate('ScanResult', { exam: group as any, imageUri: image.path });
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
      }).fetch('GET', `${API_BASE_URL}/generate_form?question_count=${group.questionCount || 20}`);

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{group.name}</Text>
          <Text style={styles.subtitle}>{group.questionCount} Soru</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('ExamConfig', { exam: group as any })}
          >
            <Text style={styles.actionText}>Cevap Anahtarı</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.scanButton]}
            onPress={handleScan}
          >
            <Text style={styles.scanText}>Tara</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.downloadButton}
          onPress={handleDownloadForm}
        >
          <Text style={styles.downloadText}>Optik Formu İndir</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.resultsContainer}>
        <Text style={styles.sectionTitle}>Tarama Sonuçları</Text>
        {(!group.results || group.results.length === 0) ? (
          <Text style={styles.emptyResults}>Henüz form taranmamış.</Text>
        ) : (
          group.results.map((res: any, index: number) => (
            <View key={res.id || index} style={styles.resultItem}>
              <View style={styles.resultInfo}>
                <Text style={styles.resultName}>{res.name}</Text>
                <Text style={styles.resultNo}>No: {res.studentNumber || 'Belirtilmemiş'}</Text>
              </View>
              <View style={styles.resultStatsRow}>
                <Text style={[styles.statText, { color: 'green' }]}>{res.correct}D</Text>
                <Text style={[styles.statText, { color: 'red' }]}>{res.wrong}Y</Text>
                <Text style={[styles.statText, { color: 'gray' }]}>{res.blank}B</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  scrollContent: { padding: 16 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  header: { marginBottom: 20, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 16, color: '#666', marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionButton: { flex: 1, backgroundColor: '#f0f0f0', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  actionText: { color: '#333', fontWeight: 'bold', fontSize: 16 },
  scanButton: { backgroundColor: '#f4511e' },
  scanText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  downloadButton: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#f4511e' },
  downloadText: { color: '#f4511e', fontWeight: 'bold', fontSize: 16 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 16 },
  resultsContainer: { marginTop: 20, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  emptyResults: { color: '#888', fontStyle: 'italic' },
  resultItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  resultNo: { fontSize: 14, color: '#666', marginTop: 2 },
  resultStatsRow: { flexDirection: 'row', gap: 12 },
  statText: { fontSize: 15, fontWeight: 'bold' }
});
