import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useStore } from '../store/useStore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { fetchSchema } from '../api/omrApi';
import { BackendSchema } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamConfig'>;

export const ExamConfigScreen = ({ route, navigation }: Props) => {
  const { exam } = route.params;
  const { updateAnswerKey } = useStore();
  
  const [schema, setSchema] = useState<BackendSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>(exam.answerKey || {});

  useEffect(() => {
    loadSchema();
  }, []);

  const loadSchema = async () => {
    try {
      const data = await fetchSchema();
      setSchema(data);
    } catch (e) {
      Alert.alert('Bağlantı Hatası', 'Şema yüklenemedi. Backend çalışıyor mu? (http://127.0.0.1:8000)');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (qNo: string, val: string) => {
    setLocalAnswers(prev => ({
      ...prev,
      [qNo]: prev[qNo] === val ? '' : val // Toggle off if clicked again
    }));
  };

  const handleSave = () => {
    updateAnswerKey(exam.id, localAnswers);
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#f4511e" />
        <Text style={{ marginTop: 10 }}>Şema Yükleniyor...</Text>
      </View>
    );
  }

  if (!schema) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text>Şema yüklenemedi. Sınav yapısı oluşturulamıyor.</Text>
        <TouchableOpacity style={[styles.saveButton, {marginTop: 20}]} onPress={loadSchema}>
          <Text style={styles.saveButtonText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderHeader = () => {
    if (!schema || !schema.questions || schema.questions.length === 0) return null;
    const firstQ = schema.questions[0];
    return (
      <View style={styles.optionsHeaderRow}>
        <View style={{ width: 30 }} />
        <View style={styles.optionsContainer}>
          {firstQ.options.map((opt: any) => (
            <View key={opt.val} style={styles.optionHeaderBubble}>
              <Text style={styles.optionHeaderText}>{opt.val}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderQuestionRow = ({ item }: { item: any }) => {
    const qNoStr = item.q_no.toString();
    const selectedVal = localAnswers[qNoStr];

    return (
      <View style={styles.questionRow}>
        <Text style={styles.questionNo}>{item.q_no}.</Text>
        <View style={styles.optionsContainer}>
          {item.options.map((opt: any) => {
            const isSelected = selectedVal === opt.val;
            return (
              <TouchableOpacity
                key={opt.val}
                style={[styles.optionBubble, isSelected && styles.optionSelected]}
                onPress={() => handleSelectOption(qNoStr, opt.val)}
              />
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={schema.questions}
        keyExtractor={item => item.q_no.toString()}
        renderItem={renderQuestionRow}
        contentContainerStyle={styles.listContainer}
        ListHeaderComponent={
          <>
            <Text style={styles.headerTitle}>{exam.title} - Doğru Cevaplar</Text>
            {renderHeader()}
          </>
        }
      />
      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Cevap Anahtarını Kaydet</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  listContainer: { padding: 16, paddingBottom: 100 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, color: '#333' },
  questionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  questionNo: { width: 30, fontSize: 16, fontWeight: 'bold', color: '#555' },
  optionsHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  optionHeaderBubble: { width: 40, alignItems: 'center', justifyContent: 'center' },
  optionHeaderText: { color: '#333', fontWeight: 'bold', fontSize: 18 },
  optionsContainer: { flexDirection: 'row', flex: 1, justifyContent: 'space-around' },
  optionBubble: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  optionSelected: { backgroundColor: '#f4511e', borderColor: '#f4511e' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee' },
  saveButton: { backgroundColor: '#f4511e', padding: 16, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
