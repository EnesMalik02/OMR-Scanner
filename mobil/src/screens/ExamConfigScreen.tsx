import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useStore } from '../store/useStore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamConfig'>;

const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E'];

export const ExamConfigScreen = ({ route, navigation }: Props) => {
  const { exam } = route.params;
  const { updateAnswerKey } = useStore();
  
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>(exam.answerKey || {});

  // Backend çağrısına gerek kalmadan soru ve şıkları doğrudan dinamik oluşturuyoruz
  const questions = Array.from({ length: exam.questionCount || 20 }, (_, i) => ({
    q_no: i + 1,
    options: CHOICE_LABELS
  }));

  const handleSelectOption = (qNo: string, val: string) => {
    setLocalAnswers(prev => ({
      ...prev,
      [qNo]: prev[qNo] === val ? '' : val // Butona tekrar basılırsa seçimi kaldır (Toggle off)
    }));
  };

  const handleSave = () => {
    updateAnswerKey(exam.id, localAnswers);
    navigation.goBack();
  };

  const renderHeader = () => {
    return (
      <View style={styles.optionsHeaderRow}>
        <View style={{ width: 30 }} />
        <View style={styles.optionsContainer}>
          {CHOICE_LABELS.map((val) => (
            <View key={val} style={styles.optionHeaderBubble}>
              <Text style={styles.optionHeaderText}>{val}</Text>
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
          {item.options.map((val: string) => {
            const isSelected = selectedVal === val;
            return (
              <TouchableOpacity
                key={val}
                style={[styles.optionBubble, isSelected && styles.optionSelected]}
                onPress={() => handleSelectOption(qNoStr, val)}
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
        data={questions}
        keyExtractor={item => item.q_no.toString()}
        renderItem={renderQuestionRow}
        contentContainerStyle={styles.listContainer}
        ListHeaderComponent={
          <>
            <Text style={styles.headerTitle}>{exam.name} - Doğru Cevaplar</Text>
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
