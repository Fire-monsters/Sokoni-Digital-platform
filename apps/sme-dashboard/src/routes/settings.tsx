import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ErrorState, LoadingState, PageHeader, Spinner } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDemoMutation, useDemoQuery } from "@/hooks/use-demo";
import { CATEGORIES, type BusinessProfile, type CropType } from "@/models/types";
import { getProfile, updateProfile } from "@/services/api";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Sokoni Digital SME" },
      { name: "description", content: "Manage your SME business profile and notification preferences." },
      { property: "og:title", content: "Settings — Sokoni Digital SME" },
      { property: "og:description", content: "Manage your SME business profile and notification preferences." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const profile = useDemoQuery(["profile"], getProfile);

  return (
    <>
      <PageHeader title="Settings" description="Business details and notification preferences for this demo workspace." />
      {
      profile.isPending ? <LoadingState
      /> : profile.isError ? <ErrorState error={profile.error} onRetry={() => profile.refetch()} /> : <ProfileForm key={profile.data.name} profile={profile.data} />}
    </>
  );
}

function ProfileForm({ profile }: { profile: BusinessProfile }) {
  const [draft, setDraft] = useState(profile);
  const [touched, setTouched] = useState(false);
  const save = useDemoMutation(updateProfile, "Business profile saved");
  const nameError = !draft.name.trim() ? "Business name is required." : "";
  const cropError = draft.cropTypes.length === 0 ? "Select cash crops, food crops or both." : "";
  const error = nameError || cropError;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!error) save.mutate(draft);
  };

  const setField = <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const toggleCropType = (crop: CropType, checked: boolean) => {
    setField("cropTypes", checked ? [...new Set([...draft.cropTypes, crop])] : draft.cropTypes.filter((item) => item !== crop));
  };

  const toggleCategory = (category: string, checked: boolean) => {
    setField("categories", checked ? [...new Set([...draft.categories, category])] : draft.categories.filter((item) => item !== category));
  };

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-8">
      <section aria-labelledby="business-profile-heading" className="space-y-4">
        <div>
          <h2 id="business-profile-heading" className="text-lg font-semibold">Business profile</h2>
          <p className="text-sm text-muted-foreground">The demo represents one SME business and one warehouse.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="business-name">Business name</Label>
            <Input id="business-name" value={draft.name} onChange={(event) => setField("name", event.target.value)} aria-invalid={touched && !!nameError} />
            {touched && nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner">Owner</Label>
            <Input id="owner" value={draft.owner} onChange={(event) => setField("owner", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Street address</Label>
            <Input id="location" value={draft.location} onChange={(event) => setField("location", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="district">District</Label>
            <Input id="district" value={draft.district} onChange={(event) => setField("district", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" value={draft.phone} onChange={(event) => setField("phone", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={draft.email} onChange={(event) => setField("email", event.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">Business description</Label>
            <Textarea id="description" value={draft.description} onChange={(event) => setField("description", event.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="hours">Business hours</Label>
            <Input id="hours" value={draft.hours} onChange={(event) => setField("hours", event.target.value)} />
          </div>
        </div>
      </section>

      <section aria-labelledby="business-focus-heading" className="space-y-3">
        <div>
          <h2 id="business-focus-heading" className="text-lg font-semibold">Business focus</h2>
          <p className="text-sm text-muted-foreground">Choose the crop types and categories shown in the wholesale catalogue.</p>
        </div>
        <fieldset className="flex flex-wrap gap-x-6 gap-y-3">
          <legend className="sr-only">Crop types</legend>
          {(["cash", "food"] as const).map((crop) => (
            <label key={crop} className="flex items-center gap-2 text-sm capitalize">
              <Checkbox checked={draft.cropTypes.includes(crop)} onCheckedChange={(checked) => toggleCropType(crop, checked === true)} />
              {crop} crops
            </label>
          ))}
        </fieldset>
        {touched && cropError && <p className="text-sm text-destructive">{cropError}</p>}
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Categories</legend>
          {Object.entries(CATEGORIES).map(([crop, categories]) => (
            <div key={crop} className="flex flex-wrap gap-x-5 gap-y-3">
              {categories.map((category) => (
                <label key={category} className="flex items-center gap-2 text-sm capitalize">
                  <Checkbox checked={draft.categories.includes(category)} onCheckedChange={(checked) => toggleCategory(category, checked === true)} />
                  {category}
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      </section>

      <section aria-labelledby="notifications-heading" className="space-y-3">
        <div>
          <h2 id="notifications-heading" className="text-lg font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground">Choose which demo events you want to be notified about.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["lowStock", "Low stock"],
            ["newOrders", "New consumer orders"],
            ["deliveries", "Incoming deliveries"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox checked={draft.notifications[key]} onCheckedChange={(checked) => setField("notifications", { ...draft.notifications, [key]: checked === true })} />
              {label}
            </label>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={save.isPending || !!error}>
          {save.isPending && <Spinner />} Save settings
        </Button>
        {touched && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}