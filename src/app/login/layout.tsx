export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center px-6 py-10">{children}</div>
  );
}
