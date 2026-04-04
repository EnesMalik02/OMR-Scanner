import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { useStore } from '../store/useStore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Groups'>;

export const GroupsScreen = ({ navigation }: Props) => {
  const [newGroupName, setNewGroupName] = useState('');
  const { groups, addGroup, removeGroup } = useStore();

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;
    addGroup(newGroupName.trim());
    setNewGroupName('');
  };

  const renderGroupItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.groupCard}
      onPress={() => navigation.navigate('GroupDetail', { groupId: item.id, groupName: item.name })}
      onLongPress={() => {
        Alert.alert('Grubu Sil', `${item.name} grubunu silmek istediğinize emin misiniz?`, [
          { text: 'İptal', style: 'cancel' },
          { text: 'Sil', style: 'destructive', onPress: () => removeGroup(item.id) },
        ]);
      }}
    >
      <Text style={styles.groupTitle}>{item.name}</Text>
      <Text style={styles.groupMeta}>{new Date(item.createdAt).toLocaleDateString()}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Yeni Sınıf/Grup Adı..."
          value={newGroupName}
          onChangeText={setNewGroupName}
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddGroup}>
          <Text style={styles.addButtonText}>Ekle</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderGroupItem}
        ListEmptyComponent={<Text style={styles.emptyText}>Henüz hiç grubunuz yok.</Text>}
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
  groupCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  groupTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  groupMeta: { fontSize: 12, color: '#999', marginTop: 4 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40 }
});
