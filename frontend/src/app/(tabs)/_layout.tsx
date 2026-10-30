import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/FloatingTabBar';

export default function TabsLayout() {
    return (
        <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
            <Tabs.Screen name="index" options={{ title: 'Home' }} />
            <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
            <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
            <Tabs.Screen name="family" options={{ title: 'Family' }} />
        </Tabs>
    );
}
