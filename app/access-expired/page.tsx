import { LogoutButton } from "@/components/logout-button";

export default function AccessExpiredPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">
        Your access has ended
      </h1>
      <p className="max-w-sm text-base text-gray-600">
        Your revision access is no longer active. Please contact your Admin
        to extend or reactivate it.
      </p>
      <LogoutButton />
    </div>
  );
}
