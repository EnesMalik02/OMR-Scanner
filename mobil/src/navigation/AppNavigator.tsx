import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { GroupsScreen } from '../screens/GroupsScreen';
import { GroupDetailScreen } from '../screens/GroupDetailScreen';
import { ExamConfigScreen } from '../screens/ExamConfigScreen';
import { ScanResultScreen } from '../screens/ScanResultScreen';
import { ResultDetailScreen } from '../screens/ResultDetailScreen';
import { Exam } from '../types';

export type RootStackParamList = {
  Groups: undefined;
  GroupDetail: { groupId: string; groupName: string };
  ExamConfig: { exam: Exam };
  ScanResult: { exam: Exam; imageUri: string };
  ResultDetail: { groupId: string; resultId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Groups"
        screenOptions={{
          headerStyle: { backgroundColor: '#f4511e' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen
          name="Groups"
          component={GroupsScreen}
          options={{ title: 'Sınıflarım / Gruplarım' }}
        />
        <Stack.Screen
          name="GroupDetail"
          component={GroupDetailScreen}
          options={({ route }) => ({ title: route.params.groupName })}
        />
        <Stack.Screen
          name="ExamConfig"
          component={ExamConfigScreen}
          options={{ title: 'Cevap Anahtarı' }}
        />
        <Stack.Screen
          name="ScanResult"
          component={ScanResultScreen}
          options={{ title: 'Tarama Sonucu' }}
        />
        <Stack.Screen
          name="ResultDetail"
          component={ResultDetailScreen}
          options={{ title: 'Sonuç Detayı' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
