import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Page } from '~/components/Page';
import { AppBreadcrumb } from '~/components/AppBreadcrumb';
import { assertAuthenticatedFn } from '~/fn/guards';
import { KnowledgeSearch } from '~/components/KnowledgeSearch';
import { PersonDetailPanel } from '~/components/PersonDetailPanel';
import { BackfillCard } from '~/components/BackfillCard';
import { DomainRulesSettings } from '~/components/DomainRulesSettings';
import { PrivacySettings } from '~/components/PrivacySettings';
import { useKnowledgeSummary, usePeopleByDomain, useFollowUpRadar } from '~/hooks/use-knowledge';
import {
  Home,
  Brain,
  Users,
  CheckCircle,
  Clock,
  Loader2,
  User,
  Star,
  AlertCircle,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { ScrollArea } from '~/components/ui/scroll-area';
import type { Person, PersonDomain } from '~/db/schema';
import { formatDistanceToNow } from 'date-fns';

export const Route = createFileRoute('/dashboard/knowledge')({
  component: KnowledgePage,
  beforeLoad: async () => {
    await assertAuthenticatedFn();
  },
});

const DOMAIN_COLORS: Record<PersonDomain, string> = {
  family: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  business: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  job: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  personal: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

function KnowledgePage() {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <Page>
      <AppBreadcrumb
        items={[
          { label: 'Dashboard', href: '/dashboard', icon: Home },
          { label: 'Knowledge', icon: Brain },
        ]}
      />

      <div className="mt-8 max-w-7xl">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Brain className="h-8 w-8 text-purple-500" />
                Knowledge Graph
              </h1>
              <p className="text-muted-foreground mt-2">
                Your unified memory of people, commitments, and interactions
              </p>
            </div>
            <KnowledgeSearch
              onSelectPerson={(person) => setSelectedPersonId(person.id)}
              onSelectCommitment={() => setActiveTab('overview')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="people">People</TabsTrigger>
                <TabsTrigger value="backfill">Backfill</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-6">
                <KnowledgeSummaryCard />
                <FollowUpRadarCard onSelectPerson={setSelectedPersonId} />
              </TabsContent>

              <TabsContent value="people" className="mt-4">
                <PeopleByDomainCard onSelectPerson={setSelectedPersonId} />
              </TabsContent>

              <TabsContent value="backfill" className="mt-4">
                <BackfillCard />
              </TabsContent>

              <TabsContent value="settings" className="mt-4 space-y-6">
                <DomainRulesSettings />
                <PrivacySettings />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar - Person Detail */}
          <div>
            {selectedPersonId ? (
              <PersonDetailPanel
                personId={selectedPersonId}
                onClose={() => setSelectedPersonId(null)}
              />
            ) : (
              <Card className="h-[500px]">
                <CardContent className="flex flex-col items-center justify-center h-full gap-2">
                  <User className="h-12 w-12 text-muted-foreground opacity-20" />
                  <p className="text-muted-foreground text-center">
                    Select a person to view their details
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    Use the search bar or click on a person below
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}

// Type for the summary response
type SummaryResponse = {
  success: boolean;
  data?: {
    people: {
      total: number;
      byDomain: Record<PersonDomain, number>;
    };
    commitments: {
      open: number;
      overdue: number;
      userOwes: number;
      theyOwe: number;
    };
    followUp: {
      staleContactsCount: number;
    };
  } | null;
  error?: string | null;
};

function KnowledgeSummaryCard() {
  const { data: rawSummaryResponse, isLoading } = useKnowledgeSummary();
  const summaryResponse = rawSummaryResponse as SummaryResponse | undefined;
  const summary = summaryResponse?.success ? summaryResponse.data : null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Knowledge Summary</CardTitle>
        <CardDescription>Your knowledge graph at a glance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryStatCard
            icon={<Users className="h-5 w-5" />}
            label="People"
            value={summary?.people.total || 0}
            color="text-blue-500"
          />
          <SummaryStatCard
            icon={<Clock className="h-5 w-5" />}
            label="Stale Contacts"
            value={summary?.followUp.staleContactsCount || 0}
            color="text-orange-500"
          />
          <SummaryStatCard
            icon={<CheckCircle className="h-5 w-5" />}
            label="Open Commitments"
            value={summary?.commitments.open || 0}
            color="text-yellow-500"
          />
          <SummaryStatCard
            icon={<AlertCircle className="h-5 w-5" />}
            label="Overdue"
            value={summary?.commitments.overdue || 0}
            color="text-red-500"
          />
        </div>

        {/* Domain Breakdown */}
        {summary?.people.byDomain && (
          <div className="mt-6">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">People by Domain</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.people.byDomain).map(([domain, count]) => (
                <Badge
                  key={domain}
                  variant="secondary"
                  className={DOMAIN_COLORS[domain as PersonDomain]}
                >
                  {domain}: {count as number}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryStatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className={`flex justify-center ${color}`}>{icon}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// Type for a person with relationships from radar
type RadarPerson = Person & {
  relationships: Array<{
    id: string;
    relationType: string;
  }>;
};

// Type for the radar response
type RadarResponse = {
  success: boolean;
  data?: RadarPerson[] | null;
  error?: string | null;
};

function FollowUpRadarCard({ onSelectPerson }: { onSelectPerson: (id: string) => void }) {
  const { data: rawRadarResponse, isLoading } = useFollowUpRadar({
    daysThreshold: 30,
    limit: 10,
  });
  const radarResponse = rawRadarResponse as RadarResponse | undefined;
  const radar = radarResponse?.success && radarResponse.data ? radarResponse.data : [];

  // Helper to calculate days since last contact
  const getDaysSinceContact = (lastContactAt: Date | null): number => {
    if (!lastContactAt) return 999;
    const now = new Date();
    const contact = new Date(lastContactAt);
    const diffTime = Math.abs(now.getTime() - contact.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-orange-500" />
          Follow-Up Radar
        </CardTitle>
        <CardDescription>People you haven't contacted in a while</CardDescription>
      </CardHeader>
      <CardContent>
        {radar.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No follow-ups needed</p>
            <p className="text-xs mt-1">All contacts are up to date</p>
          </div>
        ) : (
          <div className="space-y-2">
            {radar.map((person) => (
              <button
                key={person.id}
                onClick={() => onSelectPerson(person.id)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{person.name || person.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {person.domain && <span className="capitalize">{person.domain} • </span>}
                      {getDaysSinceContact(person.lastContactAt)} days since contact
                    </p>
                  </div>
                </div>
                {person.importanceScore && person.importanceScore >= 80 && (
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                )}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Type for the people by domain response
type PeopleByDomainResponse = {
  success: boolean;
  data?: Person[] | null;
  error?: string | null;
};

function PeopleByDomainCard({ onSelectPerson }: { onSelectPerson: (id: string) => void }) {
  const [selectedDomain, setSelectedDomain] = useState<PersonDomain>('business');
  const { data: rawPeopleResponse, isLoading } = usePeopleByDomain(selectedDomain);
  const peopleResponse = rawPeopleResponse as PeopleByDomainResponse | undefined;
  const people = peopleResponse?.success && peopleResponse.data ? peopleResponse.data : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">People by Domain</CardTitle>
        <CardDescription>Browse your contacts by life domain</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Domain Selector */}
        <div className="flex flex-wrap gap-2">
          {(['family', 'business', 'job', 'personal', 'other'] as PersonDomain[]).map((domain) => (
            <Button
              key={domain}
              variant={selectedDomain === domain ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedDomain(domain)}
              className="capitalize"
            >
              {domain}
            </Button>
          ))}
        </div>

        {/* People List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : people.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No people in this domain</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-4">
              {people.map((person: Person) => (
                <button
                  key={person.id}
                  onClick={() => onSelectPerson(person.id)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{person.name || person.email}</p>
                      {person.company && (
                        <p className="text-xs text-muted-foreground">
                          {person.role && `${person.role} at `}
                          {person.company}
                        </p>
                      )}
                      {person.lastContactAt && (
                        <p className="text-xs text-muted-foreground">
                          Last contact:{' '}
                          {formatDistanceToNow(new Date(person.lastContactAt), {
                            addSuffix: true,
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {person.importanceScore && person.importanceScore >= 80 && (
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
