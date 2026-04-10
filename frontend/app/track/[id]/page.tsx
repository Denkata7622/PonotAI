import TrackDetailsClient from "./TrackDetailsClient";

type TrackPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TrackDetailsPage({ params }: TrackPageProps) {
  const { id } = await params;

  return <TrackDetailsClient id={id} />;
}
