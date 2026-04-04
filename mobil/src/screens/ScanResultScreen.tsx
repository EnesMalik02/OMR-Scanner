import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { processForm } from '../api/omrApi';
import { ScanResult } from '../types';
import { useStore } from '../store/useStore';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanResult'>;

export const ScanResultScreen = ({ route, navigation }: Props) => {
  const { exam, imageUri } = route.params;
  const { addStudentResult } = useStore();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMSG, setErrorMSG] = useState<string | null>(null);

  useEffect(() => {
    uploadAndProcess();
  }, []);

  const uploadAndProcess = async () => {
    try {
      setLoading(true);
      setErrorMSG(null);
      const res = await processForm(imageUri, exam.questionCount);
      
      if (res.error || res.status === 'error') {
        setErrorMSG(res.error || 'Tarama sırasında hata oluştu.');
      } else {
        setResult(res);
      }
    } catch (err: any) {
      setErrorMSG(err.message || 'Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#f4511e" />
        <Text style={styles.loadingText}>Optik form okunuyor (Görüntü işleniyor)...</Text>
      </View>
    );
  }

  if (errorMSG) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>HATA: {errorMSG}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!result) return null;

  // Hesaplama (Grading)
  let correct = 0;
  let wrong = 0;
  let blank = 0;

  const evaluation: any[] = []; // { qNo, userAns, correctAns, isCorrect }
  const totalQuestionsScanned = Object.keys(result.answers).length;

  Object.entries(result.answers).forEach(([qNo, userAns]) => {
    const correctAns = exam.answerKey[qNo];
    let isCorrect = false;

    if (!userAns || userAns === 'Boş') {
      blank++;
      userAns = 'Boş Geçilmiş'; // Ekranda göstermek için
    } else if (userAns === correctAns) {
      correct++;
      isCorrect = true;
    } else {
      wrong++;
    }

    evaluation.push({ qNo, userAns, correctAns: correctAns || 'Girmedi', isCorrect });
  });

  return (
    <ScrollView style={styles.container}>
      {/* Sadece kullanıcının optik formu çektiği resmi ufak bir önizleme olarak gösterelim */}
      <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Öğrenci Bilgileri</Text>
        <Text>İsim: {result.student_info?.name}</Text>
        <Text>Öğrenci No: {result.student_info?.student_number}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Sonuç Özeti</Text>
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: '#e8f5e9' }]}>
            <Text style={styles.statNum}>{correct}</Text>
            <Text style={styles.statLabel}>Doğru</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#ffebee' }]}>
            <Text style={styles.statNum}>{wrong}</Text>
            <Text style={styles.statLabel}>Yanlış</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#f3f4f6' }]}>
            <Text style={styles.statNum}>{blank}</Text>
            <Text style={styles.statLabel}>Boş</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Soru Analizi</Text>
        {evaluation.map(item => (
          <View key={item.qNo} style={styles.evalRow}>
            <Text style={styles.evalQNo}>Soru {item.qNo}:</Text>
            <Text style={styles.evalUser}>İşaret: {item.userAns}</Text>
            <Text style={styles.evalCorrect}>Gerçek: {item.correctAns}</Text>
            <Text style={[styles.evalStatus, { color: item.isCorrect ? 'green' : (item.userAns === 'Boş' ? 'gray' : 'red') }]}>
              {item.isCorrect ? '✓' : '✗'}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity 
        style={styles.btnFinish} 
        onPress={() => {
          addStudentResult(exam.id, {
            id: Math.random().toString(36).substr(2, 9),
            name: result.student_info?.name || 'Bilinmeyen',
            studentNumber: result.student_info?.student_number || 'Bilinmiyor',
            correct,
            wrong,
            blank,
            scannedAt: Date.now()
          });
          navigation.navigate('GroupDetail', { groupId: exam.id } as any);
        }}
      >
        <Text style={styles.btnText}>Kaydet ve Bitir</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { marginTop: 10, fontSize: 16, color: '#555' },
  errorText: { fontSize: 16, color: 'red', textAlign: 'center', marginBottom: 20 },
  previewImage: { width: '100%', height: 200, backgroundColor: '#000' },
  card: { backgroundColor: '#fff', margin: 16, marginBottom: 0, padding: 16, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 8 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBox: { flex: 1, alignItems: 'center', padding: 16, borderRadius: 8, marginHorizontal: 4 },
  statNum: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 4 },
  evalRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8, marginBottom: 8 },
  evalQNo: { width: 60, fontWeight: 'bold' },
  evalUser: { flex: 1 },
  evalCorrect: { flex: 1 },
  evalStatus: { width: 30, textAlign: 'center', fontWeight: 'bold', fontSize: 18 },
  btn: { backgroundColor: '#f4511e', padding: 12, borderRadius: 8, marginTop: 10 },
  btnFinish: { backgroundColor: '#333', padding: 16, margin: 16, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
