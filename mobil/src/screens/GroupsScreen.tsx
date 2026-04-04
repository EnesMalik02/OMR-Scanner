import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Alert, Modal, StatusBar,
} from 'react-native';
import { useStore } from '../store/useStore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Groups'>;

export const GroupsScreen = ({ navigation }: Props) => {
  const { groups, addGroup, removeGroup, updateGroupName } = useStore();
  const [showModal, setShowModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [questionCount, setQuestionCount] = useState('20');

  // Edit name state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editGroupId, setEditGroupId] = useState('');
  const [editName, setEditName] = useState('');

  const handleAddGroup = () => {
    if (!newGroupName.trim()) {
      Alert.alert('Uyarı', 'Grup adı boş olamaz.');
      return;
    }
    const count = parseInt(questionCount, 10);
    if (isNaN(count) || count < 1 || count > 30) {
      Alert.alert('Hata', 'Soru sayısı 1 ile 30 arasında olmalıdır.');
      return;
    }
    addGroup(newGroupName.trim(), count);
    setNewGroupName('');
    setQuestionCount('20');
    setShowModal(false);
  };

  const handleDelete = (item: any) => {
    Alert.alert(
      'Grubu Sil',
      `"${item.name}" grubunu ve tüm tarama sonuçlarını silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Evet, Sil', style: 'destructive', onPress: () => removeGroup(item.id) },
      ]
    );
  };

  const handleEditName = (item: any) => {
    setEditGroupId(item.id);
    setEditName(item.name);
    setEditModalVisible(true);
  };

  const handleSaveEditName = () => {
    if (!editName.trim()) {
      Alert.alert('Uyarı', 'Grup adı boş olamaz.');
      return;
    }
    updateGroupName(editGroupId, editName.trim());
    setEditModalVisible(false);
  };

  const renderGroupItem = ({ item }: { item: any }) => {
    const resultCount = item.results?.length || 0;
    const hasAnswerKey = Object.keys(item.answerKey || {}).length > 0;

    return (
      <TouchableOpacity
        style={styles.groupCard}
        onPress={() => navigation.navigate('GroupDetail', { groupId: item.id, groupName: item.name })}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardIcon}>
            <Text style={styles.cardIconText}>📋</Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.groupTitle} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.groupMeta}>{item.questionCount} Soru • {new Date(item.createdAt).toLocaleDateString('tr-TR')}</Text>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.cardActionBtn} onPress={() => handleEditName(item)}>
              <Text style={styles.cardActionIcon}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardActionBtn} onPress={() => handleDelete(item)}>
              <Text style={styles.cardActionIcon}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {resultCount} Tarama
            </Text>
          </View>
          {hasAnswerKey ? (
            <View style={[styles.badge, styles.badgeGreen]}>
              <Text style={[styles.badgeText, styles.badgeGreenText]}>Cevap Anahtarı ✓</Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.badgeOrange]}>
              <Text style={[styles.badgeText, styles.badgeOrangeText]}>Cevap Anahtarı Yok</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#f4511e" barStyle="light-content" />

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderGroupItem}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyTitle}>Henüz grubunuz yok</Text>
            <Text style={styles.emptySubtext}>Aşağıdaki butona basarak ilk grubunuzu oluşturun.</Text>
          </View>
        }
        contentContainerStyle={styles.listContainer}
      />

      {/* FAB - Grup Oluştur */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowModal(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>Grup Oluştur</Text>
      </TouchableOpacity>

      {/* Yeni Grup Oluşturma Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Yeni Grup Oluştur</Text>

            <Text style={styles.inputLabel}>Grup / Sınıf Adı</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: 10-A Matematik"
              value={newGroupName}
              onChangeText={setNewGroupName}
              autoFocus
            />

            <Text style={styles.inputLabel}>Soru Sayısı</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="1 - 30"
              value={questionCount}
              onChangeText={setQuestionCount}
              keyboardType="numeric"
              maxLength={2}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowModal(false);
                  setNewGroupName('');
                  setQuestionCount('20');
                }}
              >
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalConfirm} onPress={handleAddGroup}>
                <Text style={styles.modalConfirmText}>Oluştur</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* İsim Düzenleme Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Grup Adını Düzenle</Text>

            <Text style={styles.inputLabel}>Yeni Grup Adı</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Grup adı..."
              value={editName}
              onChangeText={setEditName}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalConfirm} onPress={handleSaveEditName}>
                <Text style={styles.modalConfirmText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  listContainer: { padding: 16, paddingBottom: 100 },

  // Group Card
  groupCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#fff3ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardIconText: { fontSize: 22 },
  cardInfo: { flex: 1 },
  groupTitle: { fontSize: 17, fontWeight: 'bold', color: '#1f2937' },
  groupMeta: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 4 },
  cardActionBtn: { padding: 6 },
  cardActionIcon: { fontSize: 16 },

  cardBottom: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  badge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  badgeGreen: { backgroundColor: '#dcfce7' },
  badgeGreenText: { color: '#16a34a' },
  badgeOrange: { backgroundColor: '#fff7ed' },
  badgeOrangeText: { color: '#ea580c' },

  // Empty State
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#374151', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 22 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: '#f4511e',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f4511e',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabIcon: { fontSize: 22, color: '#fff', fontWeight: 'bold', marginRight: 8 },
  fabText: { color: '#fff', fontWeight: 'bold', fontSize: 17 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937', marginBottom: 20, textAlign: 'center' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  modalInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1f2937',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  modalCancelText: { color: '#6b7280', fontWeight: 'bold', fontSize: 16 },
  modalConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f4511e',
  },
  modalConfirmText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
