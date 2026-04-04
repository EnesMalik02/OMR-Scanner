import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, ScrollView, TouchableOpacity, Alert } from 'react-native';
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
  const [saved, setSaved] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    uploadAndProcess();
    return () => {
      isMounted.current = false;
    };
  }, []);

  const gradeResult = (res: ScanResult) => {
    let correct = 0;
    let wrong = 0;
    let blank = 0;

    const answers = res.answers || {};
    const answerKey = exam.answerKey || {};

    Object.entries(answers).forEach(([qNo, userAns]) => {
      const correctAns = answerKey[qNo];

      if (!userAns || userAns === 'Boş') {
        blank++;
      } else if (userAns.includes(',')) {
        // Multiple answers marked — counts as wrong
        wrong++;
      } else if (userAns === correctAns) {
        correct++;
      } else {
        wrong++;
      }
    });

    // Also count questions with no answer at all as blank
    const totalQ = exam.questionCount;
    const answeredCount = Object.keys(answers).length;
    if (answeredCount < totalQ) {
      blank += totalQ - answeredCount;
    }

    // Score: 100 üzerinden, max 2 decimal
    const score = totalQ > 0 ? parseFloat(((correct / totalQ) * 100).toFixed(2)) : 0;

    return { correct, wrong, blank, score };
  };

  const saveResult = (res: ScanResult) => {
    const { correct, wrong, blank, score } = gradeResult(res);

    addStudentResult(exam.id, {
      id: Math.random().toString(36).substr(2, 9),
      name: (res.student_info as any)?.student_name || res.student_info?.name || 'Bilinmeyen',
      studentNumber: res.student_info?.student_number || 'Bilinmiyor',
      correct,
      wrong,
      blank,
      score,
      answers: res.answers || {},
      scannedAt: Date.now(),
    });
    setSaved(true);
  };

  const uploadAndProcess = async () => {
    try {
      setLoading(true);
      setErrorMSG(null);
      const res = await processForm(imageUri, exam.questionCount);

      if (!isMounted.current) {
        // Screen was left — save result silently in background
        if (!(res.error || res.status === 'error')) {
          saveResult(res);
        }
        return;
      }

      if (res.error || res.status === 'error') {
        setErrorMSG(res.error || 'Tarama sırasında hata oluştu.');
      } else {
        setResult(res);
      }
    } catch (err: any) {
      if (isMounted.current) {
        setErrorMSG(err.message || 'Bağlantı hatası.');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  // Navigate back immediately for another scan
  const handleScanAnother = () => {
    if (result && !saved) {
      saveResult(result);
    }
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#f4511e" />
        <Text style={styles.loadingText}>Optik form okunuyor...</Text>
        <Text style={styles.loadingSubtext}>İşlem devam ederken geri dönebilirsiniz.{'\n'}Sonuç hazır olunca otomatik kaydedilir.</Text>
        <TouchableOpacity style={styles.backWhileLoading} onPress={() => navigation.goBack()}>
          <Text style={styles.backWhileLoadingText}>← Geri Dön (Arka planda devam eder)</Text>
        </TouchableOpacity>
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

  const { correct, wrong, blank, score } = gradeResult(result);

  // Detailed evaluation
  const evaluation: any[] = [];
  const answers = result.answers || {};
  const answerKey = exam.answerKey || {};

  for (let i = 1; i <= exam.questionCount; i++) {
    const qNo = String(i);
    let userAns = answers[qNo] || '';
    const correctAns = answerKey[qNo] || '-';
    let status: 'correct' | 'wrong' | 'blank' | 'multiple' = 'blank';
    let explanation: string | undefined;

    if (!userAns || userAns === 'Boş') {
      status = 'blank';
      userAns = 'Boş';
    } else if (userAns.includes(',')) {
      status = 'multiple';
      const parts = userAns.split(',').map(s => s.trim()).filter(Boolean);
      userAns = parts.join(' ve ');
      explanation = `${parts.join(' ve ')} şıkları birlikte işaretlenmiş. Birden fazla şık işaretlendiği için yanlış sayılmıştır.`;
    } else if (userAns.trim() === correctAns.trim()) {
      status = 'correct';
    } else {
      status = 'wrong';
    }

    evaluation.push({ qNo, userAns, correctAns, status, explanation });
  }

  return (
    <ScrollView style={styles.container}>
      <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Öğrenci Bilgileri</Text>
        <Text>İsim: {(result.student_info as any)?.student_name || result.student_info?.name || 'Okunamadı'}</Text>
        <Text>Öğrenci No: {result.student_info?.student_number || 'Okunamadı'}</Text>
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
          <View style={[styles.statBox, { backgroundColor: '#eff6ff' }]}>
            <Text style={[styles.statNum, { color: '#2563eb' }]}>{score.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Puan</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Soru Analizi</Text>
        {evaluation.map((item: any) => (
          <View key={item.qNo}>
            <View
              style={[
                styles.evalRow,
                {
                  backgroundColor:
                    item.status === 'correct'
                      ? '#f0fdf4'
                      : item.status === 'wrong' || item.status === 'multiple'
                      ? '#fef2f2'
                      : '#f9f9f9',
                },
              ]}
            >
              <Text style={styles.evalQNo}>Soru {item.qNo}:</Text>
              <Text style={styles.evalUser}>İşaret: {item.userAns}</Text>
              <Text style={styles.evalCorrect}>Cevap: {item.correctAns}</Text>
              <Text
                style={[
                  styles.evalStatus,
                  {
                    color:
                      item.status === 'correct'
                        ? '#16a34a'
                        : item.status === 'multiple'
                        ? '#d97706'
                        : item.status === 'wrong'
                        ? '#dc2626'
                        : '#9ca3af',
                  },
                ]}
              >
                {item.status === 'correct' ? '✓' : item.status === 'multiple' ? '⚠' : '✗'}
              </Text>
            </View>
            {item.explanation && (
              <View style={styles.explanationBox}>
                <Text style={styles.explanationText}>ℹ️ {item.explanation}</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.btnSave}
          onPress={() => {
            if (!saved) {
              saveResult(result);
            }
            navigation.navigate('GroupDetail', { groupId: exam.id } as any);
          }}
        >
          <Text style={styles.btnText}>Kaydet ve Bitir</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnScanMore} onPress={handleScanAnother}>
          <Text style={styles.btnScanMoreText}>Kaydet & Başka Tara</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { marginTop: 12, fontSize: 16, color: '#555', fontWeight: 'bold' },
  loadingSubtext: { marginTop: 6, fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20 },
  backWhileLoading: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f4511e',
  },
  backWhileLoadingText: { color: '#f4511e', fontWeight: 'bold', fontSize: 14 },
  errorText: { fontSize: 16, color: 'red', textAlign: 'center', marginBottom: 20 },
  previewImage: { width: '100%', height: 200, backgroundColor: '#000' },
  card: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
    paddingBottom: 8,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBox: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 8, marginHorizontal: 3 },
  statNum: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 11, color: '#666', marginTop: 4 },
  evalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  evalQNo: { width: 60, fontWeight: 'bold', fontSize: 13 },
  evalUser: { flex: 1, fontSize: 13 },
  evalCorrect: { flex: 1, fontSize: 13 },
  evalStatus: { width: 30, textAlign: 'center', fontWeight: 'bold', fontSize: 18 },
  explanationBox: {
    marginLeft: 60,
    marginBottom: 8,
    marginTop: -2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fffbeb',
    borderRadius: 6,
  },
  explanationText: { fontSize: 12, color: '#92400e', lineHeight: 18 },
  actionRow: {
    flexDirection: 'row',
    margin: 16,
    gap: 10,
  },
  btn: { backgroundColor: '#f4511e', padding: 12, borderRadius: 8, marginTop: 10 },
  btnSave: {
    flex: 1,
    backgroundColor: '#333',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnScanMore: {
    flex: 1,
    backgroundColor: '#f4511e',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnScanMoreText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
