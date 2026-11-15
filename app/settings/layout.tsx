import SettingsTabs from "@/components/SettingsTabs";

// Settings: staff, and the venues watched for outside shows.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
