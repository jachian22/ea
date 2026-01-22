import { useState } from 'react';
import {
  Shield,
  Cloud,
  CloudOff,
  Plus,
  X,
  User,
  AtSign,
  FileText,
  Loader2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { Badge } from '~/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import {
  usePrivacySettings,
  useSetCloudAIPermission,
  useAddExcludedDomain,
  useRemoveExcludedDomain,
  useAddExcludedEmailDomain,
  useRemoveExcludedEmailDomain,
  useAddRedactPattern,
  useRemoveRedactPattern,
  useRedactionPatternSuggestions,
} from '~/hooks/use-privacy';
import type { PersonDomain } from '~/db/schema';

const DOMAIN_LABELS: Record<PersonDomain, string> = {
  family: 'Family',
  business: 'Business',
  job: 'Job',
  personal: 'Personal',
  other: 'Other',
};

const DOMAIN_COLORS: Record<PersonDomain, string> = {
  family: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  business: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  job: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  personal: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export function PrivacySettings() {
  const { data: settingsResponse, isLoading } = usePrivacySettings();
  const settings = settingsResponse?.success ? settingsResponse.data : null;

  const setCloudAI = useSetCloudAIPermission();

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
    <div className="space-y-6">
      {/* Master Cloud AI Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy Controls
          </CardTitle>
          <CardDescription>Control what data can be sent to cloud AI services</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cloud AI Master Switch */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-4">
              {settings?.allowCloudAI ? (
                <Cloud className="h-8 w-8 text-blue-500" />
              ) : (
                <CloudOff className="h-8 w-8 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">Cloud AI Processing</p>
                <p className="text-sm text-muted-foreground">
                  {settings?.allowCloudAI
                    ? 'AI features are enabled. Data may be sent to cloud AI services.'
                    : 'AI features are disabled. No data is sent to cloud services.'}
                </p>
              </div>
            </div>
            <Switch
              checked={settings?.allowCloudAI ?? true}
              onCheckedChange={(allow) => setCloudAI.mutate(allow)}
              disabled={setCloudAI.isPending}
            />
          </div>

          {settings?.allowCloudAI && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Privacy Protection Active</AlertTitle>
              <AlertDescription>
                Configure exclusions below to control exactly what data can be processed by AI.
                Excluded data will never be sent to cloud services.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Domain Exclusions */}
      {settings?.allowCloudAI && (
        <>
          <ExcludedDomainsCard
            excludedDomains={(settings?.excludedDomains as PersonDomain[]) || []}
          />
          <ExcludedEmailDomainsCard excludedEmailDomains={settings?.excludedEmailDomains || []} />
          <RedactionPatternsCard redactPatterns={settings?.redactPatterns || []} />
        </>
      )}
    </div>
  );
}

function ExcludedDomainsCard({ excludedDomains }: { excludedDomains: PersonDomain[] }) {
  const addDomain = useAddExcludedDomain();
  const removeDomain = useRemoveExcludedDomain();

  const availableDomains = (
    ['family', 'business', 'job', 'personal', 'other'] as PersonDomain[]
  ).filter((d) => !excludedDomains.includes(d));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" />
          Excluded Life Domains
        </CardTitle>
        <CardDescription>
          People and content from these domains will never be sent to cloud AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Exclusions */}
        {excludedDomains.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {excludedDomains.map((domain) => (
              <Badge key={domain} variant="secondary" className={`${DOMAIN_COLORS[domain]} gap-1`}>
                {DOMAIN_LABELS[domain]}
                <button
                  onClick={() => removeDomain.mutate(domain)}
                  className="ml-1 hover:bg-black/10 rounded-full"
                  disabled={removeDomain.isPending}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No domains excluded. All domains may be processed by AI.
          </p>
        )}

        {/* Add Domain */}
        {availableDomains.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              onValueChange={(domain) => addDomain.mutate(domain as PersonDomain)}
              disabled={addDomain.isPending}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Add excluded domain..." />
              </SelectTrigger>
              <SelectContent>
                {availableDomains.map((domain) => (
                  <SelectItem key={domain} value={domain}>
                    {DOMAIN_LABELS[domain]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Warning for Family */}
        {!excludedDomains.includes('family') && (
          <Alert
            variant="default"
            className="bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800"
          >
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              Consider excluding "Family" domain to keep personal family information private.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ExcludedEmailDomainsCard({ excludedEmailDomains }: { excludedEmailDomains: string[] }) {
  const [newDomain, setNewDomain] = useState('');
  const addDomain = useAddExcludedEmailDomain();
  const removeDomain = useRemoveExcludedEmailDomain();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;

    const domain = newDomain.trim().toLowerCase();
    const formatted = domain.startsWith('@') ? domain : `@${domain}`;

    addDomain.mutate(formatted, {
      onSuccess: () => setNewDomain(''),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AtSign className="h-4 w-4" />
          Excluded Email Domains
        </CardTitle>
        <CardDescription>
          Emails from these domains will never be processed by cloud AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Exclusions */}
        {excludedEmailDomains.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {excludedEmailDomains.map((domain) => (
              <Badge key={domain} variant="outline" className="gap-1 font-mono">
                {domain}
                <button
                  onClick={() => removeDomain.mutate(domain)}
                  className="ml-1 hover:bg-black/10 rounded-full"
                  disabled={removeDomain.isPending}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No email domains excluded.</p>
        )}

        {/* Add Domain */}
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <Input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="@personal-domain.com"
            className="max-w-[250px] font-mono"
          />
          <Button type="submit" size="sm" disabled={!newDomain.trim() || addDomain.isPending}>
            {addDomain.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RedactionPatternsCard({ redactPatterns }: { redactPatterns: string[] }) {
  const [newPattern, setNewPattern] = useState('');
  const addPattern = useAddRedactPattern();
  const removePattern = useRemoveRedactPattern();
  const { data: suggestionsResponse } = useRedactionPatternSuggestions();
  const suggestions = suggestionsResponse?.success ? suggestionsResponse.data || [] : [];

  const handleAdd = (pattern: string) => {
    if (!pattern.trim()) return;

    addPattern.mutate(pattern.trim(), {
      onSuccess: () => setNewPattern(''),
    });
  };

  const unusedSuggestions = suggestions.filter((s) => !redactPatterns.includes(s.pattern));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Redaction Patterns
        </CardTitle>
        <CardDescription>
          Text matching these patterns will be redacted before sending to AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Patterns */}
        {redactPatterns.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {redactPatterns.map((pattern) => (
              <Badge key={pattern} variant="outline" className="gap-1 font-mono text-xs">
                {pattern}
                <button
                  onClick={() => removePattern.mutate(pattern)}
                  className="ml-1 hover:bg-black/10 rounded-full"
                  disabled={removePattern.isPending}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No redaction patterns configured.</p>
        )}

        {/* Add Pattern */}
        <div className="flex items-center gap-2">
          <Input
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            placeholder="Pattern or regex..."
            className="max-w-[250px] font-mono text-sm"
          />
          <Button
            size="sm"
            onClick={() => handleAdd(newPattern)}
            disabled={!newPattern.trim() || addPattern.isPending}
          >
            {addPattern.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>

          {/* Suggestions Popover */}
          {unusedSuggestions.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  Suggestions
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Common Patterns</p>
                  <div className="space-y-1">
                    {unusedSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.pattern}
                        onClick={() => handleAdd(suggestion.pattern)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm"
                        disabled={addPattern.isPending}
                      >
                        <div className="font-mono text-xs">{suggestion.pattern}</div>
                        <div className="text-xs text-muted-foreground">
                          {suggestion.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Patterns support regular expressions. Matched text will be replaced with [REDACTED].
        </p>
      </CardContent>
    </Card>
  );
}
