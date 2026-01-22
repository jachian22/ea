import { useState, useCallback } from 'react';
import { Search, User, FileCheck, Loader2 } from 'lucide-react';
import { Input } from '~/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { useSearchKnowledge } from '~/hooks/use-knowledge';
import { useDebounce } from '~/hooks/use-debounce';
import type { Person, Commitment } from '~/db/schema';

// Type for the search knowledge response
type SearchKnowledgeResponse = {
  success: boolean;
  data?: {
    people: Person[];
    commitments: Array<Commitment & { person: Person | null }>;
  } | null;
  error?: string | null;
};

interface KnowledgeSearchProps {
  onSelectPerson?: (person: Person) => void;
  onSelectCommitment?: (commitment: Commitment) => void;
  placeholder?: string;
}

export function KnowledgeSearch({
  onSelectPerson,
  onSelectCommitment,
  placeholder = 'Search people, commitments...',
}: KnowledgeSearchProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const debouncedValue = useDebounce(inputValue, 300);

  const { data: rawData, isLoading } = useSearchKnowledge(
    debouncedValue,
    debouncedValue.length >= 2
  );

  // Cast the response to the expected type
  const data = rawData as SearchKnowledgeResponse | undefined;
  const people: Person[] = data?.success && data.data ? data.data.people : [];
  const commitments = data?.success && data.data ? data.data.commitments : [];

  const handleSelect = useCallback(
    (type: 'person' | 'commitment', item: Person | Commitment) => {
      setOpen(false);
      setInputValue('');
      if (type === 'person' && onSelectPerson) {
        onSelectPerson(item as Person);
      } else if (type === 'commitment' && onSelectCommitment) {
        onSelectCommitment(item as Commitment);
      }
    },
    [onSelectPerson, onSelectCommitment]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (e.target.value.length >= 2) {
                setOpen(true);
              }
            }}
            onFocus={() => {
              if (inputValue.length >= 2) {
                setOpen(true);
              }
            }}
            className="pl-9"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandList>
            {inputValue.length < 2 && (
              <CommandEmpty>Type at least 2 characters to search</CommandEmpty>
            )}
            {inputValue.length >= 2 &&
              !isLoading &&
              people.length === 0 &&
              commitments.length === 0 && <CommandEmpty>No results found.</CommandEmpty>}

            {people.length > 0 && (
              <CommandGroup heading="People">
                {people.slice(0, 5).map((person) => (
                  <CommandItem
                    key={person.id}
                    value={person.id}
                    onSelect={() => handleSelect('person', person)}
                    className="cursor-pointer"
                  >
                    <User className="mr-2 h-4 w-4" />
                    <div className="flex flex-col">
                      <span>{person.name || person.email}</span>
                      {person.name && (
                        <span className="text-xs text-muted-foreground">{person.email}</span>
                      )}
                    </div>
                    {person.domain && (
                      <span className="ml-auto text-xs text-muted-foreground capitalize">
                        {person.domain}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {commitments.length > 0 && (
              <CommandGroup heading="Commitments">
                {commitments.slice(0, 5).map((commitment) => (
                  <CommandItem
                    key={commitment.id}
                    value={commitment.id}
                    onSelect={() => handleSelect('commitment', commitment)}
                    className="cursor-pointer"
                  >
                    <FileCheck className="mr-2 h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="line-clamp-1">{commitment.description}</span>
                      <span className="text-xs text-muted-foreground">
                        {commitment.direction === 'user_owes' ? 'You owe' : 'They owe'}
                        {commitment.dueDate &&
                          ` • Due ${new Date(commitment.dueDate).toLocaleDateString()}`}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
