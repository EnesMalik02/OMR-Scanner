import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, PermissionsAndroid, Platform, ScrollView, TextInput, Modal } from 'react-native';
import { useStore } from '../store/useStore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import ImagePicker from 'react-native-image-crop-picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { API_BASE_URL, processForm } from '../api/omrApi';
import * as XLSX from 'xlsx';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetail'>;

export const GroupDetailScreen = ({ route, navigation }: Props) => {
  const { groupId } = route.params;
  const { groups, addStudentResult, updateStudentResult } = useStore();

  const group = groups.find(g => g.id === groupId);

  if (!group) {
    return (
      <View style={[styles.container, styles.centered]}>
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

    try {
      const image = await ImagePicker.openCamera({
        cropping: false,
        compressImageQuality: 0.6,
        compressImageMaxWidth: 1200,
        compressImageMaxHeight: 1600,
        mediaType: 'photo',
      });

      // Pending sonucu oluştur
      const pendingId = Math.random().toString(36).substr(2, 9);
      addStudentResult(group.id, {
        id: pendingId,
        name: 'Okunuyor...',
        studentNumber: '',
        correct: 0,
        wrong: 0,
        blank: 0,
        score: 0,
        answers: {},
        scannedAt: Date.now(),
        pending: true,
      });

      // Arka planda işle
      processFormInBackground(image.path, pendingId);

    } catch (e: any) {
      if (e.message !== 'User cancelled image selection') {
        Alert.alert('Kamera Hatası', e.message);
      }
    }
  };

  const processFormInBackground = async (imageUri: string, pendingId: string) => {
    try {
      const res = await processForm(imageUri, group.questionCount);

      if (res.error || res.status === 'error') {
        updateStudentResult(group.id, pendingId, {
          name: 'Hata Oluştu',
          pending: false,
        });
        return;
      }

      // Grade it
      let correct = 0;
      let wrong = 0;
      let blank = 0;
      const answers = res.answers || {};
      const answerKey = group.answerKey || {};

      Object.entries(answers).forEach(([qNo, userAns]) => {
        const correctAns = answerKey[qNo];
        if (!userAns || userAns === 'Boş') {
          blank++;
        } else if (userAns.includes(',')) {
          wrong++;
        } else if (userAns === correctAns) {
          correct++;
        } else {
          wrong++;
        }
      });

      const answeredCount = Object.keys(answers).length;
      if (answeredCount < group.questionCount) {
        blank += group.questionCount - answeredCount;
      }

      const score = parseFloat(((correct / (group.questionCount || 1)) * 100).toFixed(2));

      updateStudentResult(group.id, pendingId, {
        name: (res.student_info as any)?.student_name || res.student_info?.name || 'Bilinmeyen',
        studentNumber: res.student_info?.student_number || 'Bilinmiyor',
        correct,
        wrong,
        blank,
        score,
        answers: res.answers || {},
        pending: false,
      });
    } catch (err: any) {
      updateStudentResult(group.id, pendingId, {
        name: 'Bağlantı Hatası',
        pending: false,
      });
    }
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

  const handleExportExcel = async () => {
    try {
      const completedResults = (group.results || []).filter((r: any) => !r.pending);
      if (completedResults.length === 0) {
        Alert.alert('Uyarı', 'Dışa aktarılacak sonuç bulunmuyor.');
        return;
      }

      const data = completedResults.map((res: any, index: number) => ({
        'Sıra': index + 1,
        'Öğrenci Adı': res.name || 'Bilinmeyen',
        'Öğrenci No': res.studentNumber || 'Belirtilmemiş',
        'Doğru Sayısı': res.correct,
        'Yanlış Sayısı': res.wrong,
        'Boş Sayısı': res.blank,
        'Puan (100 üzerinden)': ((res.correct / (group.questionCount || 1)) * 100).toFixed(2),
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 6 }, { wch: 25 }, { wch: 15 },
        { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 20 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, group.name);

      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const dirs = ReactNativeBlobUtil.fs.dirs;
      const fileName = `${group.name.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, '_')}_sonuclari.xlsx`;
      const filePath = `${dirs.DownloadDir}/${fileName}`;

      await ReactNativeBlobUtil.fs.writeFile(filePath, wbout, 'base64');

      if (Platform.OS === 'android') {
        ReactNativeBlobUtil.android.actionViewIntent(
          filePath,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
      }

      Alert.alert('Başarılı', `Excel dosyası kaydedildi:\n${fileName}`);
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Excel dosyası oluşturulamadı.');
    }
  };

  const handleResultPress = (res: any) => {
    if (res.pending) return; // tıklanamaz
    navigation.navigate('ResultDetail', { groupId: group.id, resultId: res.id });
  };

  const completedResults = (group.results || [])
    .filter((r: any) => !r.pending)
    .sort((a: any, b: any) => (b.scannedAt || 0) - (a.scannedAt || 0));
  const pendingResults = (group.results || []).filter((r: any) => r.pending);
  const hasAnswerKey = Object.keys(group.answerKey || {}).length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View style={styles.headerIconBox}>
            <Text style={styles.headerIconText}>📋</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{group.name}</Text>
            <Text style={styles.headerSubtitle}>{group.questionCount} Soru</Text>
          </View>
        </View>

        {/* Status badges */}
        <View style={styles.statusRow}>
          {hasAnswerKey ? (
            <View style={[styles.statusBadge, styles.statusGreen]}>
              <Text style={styles.statusGreenText}>✓ Cevap Anahtarı Hazır</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, styles.statusOrange]}>
              <Text style={styles.statusOrangeText}>⚠ Cevap Anahtarı Girilmemiş</Text>
            </View>
          )}
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{completedResults.length} Tarama</Text>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsCard}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('ExamConfig', { exam: group as any })}
          >
            <Text style={styles.actionBtnIcon}>📝</Text>
            <Text style={styles.actionBtnText}>Cevap Anahtarı</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.scanBtn]}
            onPress={handleScan}
          >
            <Text style={styles.actionBtnIcon}>📷</Text>
            <Text style={styles.scanBtnText}>Tara</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.downloadBtn} onPress={handleDownloadForm}>
          <Text style={styles.downloadBtnIcon}>⬇️</Text>
          <Text style={styles.downloadBtnText}>Optik Formu İndir</Text>
        </TouchableOpacity>

        {completedResults.length > 0 && (
          <TouchableOpacity style={styles.excelBtn} onPress={handleExportExcel}>
            <Text style={styles.excelBtnIcon}>📊</Text>
            <Text style={styles.excelBtnText}>Sonuçları Excel'e Aktar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Scan Results */}
      <View style={styles.resultsSection}>
        <Text style={styles.sectionTitle}>Tarama Sonuçları</Text>

        {/* Pending scans */}
        {pendingResults.map((res: any, index: number) => (
          <View key={res.id || `pending-${index}`} style={[styles.resultCard, styles.resultCardPending]}>
            <View style={styles.pendingDot} />
            <View style={styles.resultInfo}>
              <Text style={styles.pendingText}>⏳ Taranıyor...</Text>
              <Text style={styles.pendingSubtext}>Optik form okunuyor, lütfen bekleyin</Text>
            </View>
          </View>
        ))}

        {/* Completed scans */}
        {completedResults.length === 0 && pendingResults.length === 0 ? (
          <View style={styles.emptyResultsBox}>
            <Text style={styles.emptyResultsIcon}>📄</Text>
            <Text style={styles.emptyResultsText}>Henüz form taranmamış</Text>
            <Text style={styles.emptyResultsSubtext}>Yukarıdaki "Tara" butonunu kullanarak başlayın</Text>
          </View>
        ) : (
          completedResults.map((res: any, index: number) => {
            const score = parseFloat(((res.correct / (group.questionCount || 1)) * 100).toFixed(2));

            return (
              <TouchableOpacity
                key={res.id || index}
                style={styles.resultCard}
                onPress={() => handleResultPress(res)}
                activeOpacity={0.7}
              >
                <View style={styles.resultLeft}>
                  <View style={styles.resultAvatar}>
                    <Text style={styles.resultAvatarText}>
                      {(res.name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName} numberOfLines={1}>{res.name}</Text>
                    <Text style={styles.resultNo}>No: {res.studentNumber || 'Belirtilmemiş'}</Text>
                  </View>
                </View>

                <View style={styles.resultRight}>
                  <View style={styles.resultStats}>
                    <Text style={styles.statCorrect}>{res.correct}D</Text>
                    <Text style={styles.statWrong}>{res.wrong}Y</Text>
                    <Text style={styles.statBlank}>{res.blank}B</Text>
                  </View>
                  <Text style={styles.resultScore}>{score.toFixed(2)}</Text>
                </View>

                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContent: { padding: 16, paddingBottom: 30 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 16 },

  // Header Card
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center' },
  headerIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#fff3ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  headerIconText: { fontSize: 26 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#1f2937' },
  headerSubtitle: { fontSize: 14, color: '#9ca3af', marginTop: 2 },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  statusBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  statusText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  statusGreen: { backgroundColor: '#dcfce7' },
  statusGreenText: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  statusOrange: { backgroundColor: '#fff7ed' },
  statusOrangeText: { fontSize: 12, color: '#ea580c', fontWeight: '600' },

  // Actions Card
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 6,
  },
  actionBtnIcon: { fontSize: 16 },
  actionBtnText: { color: '#374151', fontWeight: 'bold', fontSize: 15 },
  scanBtn: { backgroundColor: '#f4511e', borderColor: '#f4511e' },
  scanBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#f4511e',
    gap: 6,
  },
  downloadBtnIcon: { fontSize: 14 },
  downloadBtnText: { color: '#f4511e', fontWeight: 'bold', fontSize: 15 },
  excelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    marginTop: 10,
    gap: 6,
  },
  excelBtnIcon: { fontSize: 14 },
  excelBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  // Results Section
  resultsSection: { marginTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937', marginBottom: 12, paddingHorizontal: 4 },

  // Result Card
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  resultCardPending: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderStyle: 'dashed',
  },
  pendingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f59e0b',
    marginRight: 12,
  },
  pendingText: { fontSize: 15, fontWeight: 'bold', color: '#92400e' },
  pendingSubtext: { fontSize: 12, color: '#b45309', marginTop: 2 },

  resultLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  resultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f4511e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resultAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 17 },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 15, fontWeight: 'bold', color: '#1f2937' },
  resultNo: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  resultRight: { alignItems: 'flex-end', marginRight: 8 },
  resultStats: { flexDirection: 'row', gap: 8 },
  statCorrect: { fontSize: 13, fontWeight: 'bold', color: '#16a34a' },
  statWrong: { fontSize: 13, fontWeight: 'bold', color: '#dc2626' },
  statBlank: { fontSize: 13, fontWeight: 'bold', color: '#9ca3af' },
  resultScore: { fontSize: 14, color: '#2563eb', fontWeight: 'bold', marginTop: 4 },

  chevron: { fontSize: 22, color: '#d1d5db', fontWeight: 'bold' },

  // Empty results
  emptyResultsBox: { alignItems: 'center', paddingVertical: 30 },
  emptyResultsIcon: { fontSize: 36, marginBottom: 10 },
  emptyResultsText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  emptyResultsSubtext: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
});
