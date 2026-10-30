-- =====================================================================
-- Airports and terminals as data, instead of hard-coded BLR T1/T2.
--
-- • regions:   where SCab runs; owns currency, timezone and fares
-- • airports:  every Indian airport with scheduled flights (OurAirports)
-- • terminals: each airport's terminals + cab meeting point; single-terminal
--              airports get one 'MAIN' terminal. Multi-terminal locations come
--              from Ola Maps.
-- • trips.terminal_id replaces the 'T1'/'T2' text. trips.terminal stays,
--   filled from the terminal's code, so the current app keeps working.
-- • Fares and the minimum saving move from matching_settings to regions.
--
-- Pickups are still airport terminals only; address pickups come later.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. New tables
-- ---------------------------------------------------------------------

-- REGIONS: an area SCab operates in (a country for now; can be split into cities)
create table public.regions (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,                         -- 'IN'
  name              text not null,
  country_code      text not null check (country_code ~ '^[A-Z]{2}$'),   -- ISO 3166-1
  currency          text not null check (currency ~ '^[A-Z]{3}$'),       -- ISO 4217
  timezone          text not null,                                -- IANA, e.g. 'Asia/Kolkata'
  area              extensions.geography(Polygon, 4326) not null,
  fare_base         numeric not null,
  fare_per_km       numeric not null,
  min_saving_amount numeric not null,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

comment on column public.regions.fare_base         is 'Solo fare estimate = fare_base + fare_per_km × road km (in currency)';
comment on column public.regions.min_saving_amount is 'Each rider must save at least this much (in currency) vs riding alone';
comment on column public.regions.area              is 'Rough boundary, used to find the region of an address pickup';

-- AIRPORTS
create table public.airports (
  id          uuid primary key default gen_random_uuid(),
  region_id   uuid not null references public.regions (id),
  iata        text not null unique check (iata ~ '^[A-Z]{3}$'),
  icao        text,
  name        text not null,
  city        text,
  location    extensions.geography(Point, 4326) not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- TERMINALS: where riders meet the cab. Every airport has at least one.
create table public.terminals (
  id             uuid primary key default gen_random_uuid(),
  airport_id     uuid not null references public.airports (id) on delete cascade,
  code           text not null,               -- 'T1', 'T2', … or 'MAIN' for single-terminal airports
  name           text not null,               -- shown to riders: 'Terminal 1'
  location       extensions.geography(Point, 4326) not null,
  meeting_point  text not null,
  sort           int not null default 0,
  active         boolean not null default true,
  unique (airport_id, code)
);

create index airports_region_idx     on public.airports (region_id);
create index airports_location_idx   on public.airports using gist (location);
create index terminals_location_idx  on public.terminals using gist (location);

-- Reference data: readable by any signed-in user, edited only from the dashboard/migrations
alter table public.regions   enable row level security;
alter table public.airports  enable row level security;
alter table public.terminals enable row level security;

create policy "regions: read"   on public.regions   for select to authenticated using (true);
create policy "airports: read"  on public.airports  for select to authenticated using (true);
create policy "terminals: read" on public.terminals for select to authenticated using (true);


-- ---------------------------------------------------------------------
-- 2. Seed data
-- ---------------------------------------------------------------------

-- India, with the fares currently tuned in matching_settings
insert into public.regions (code, name, country_code, currency, timezone, area,
                            fare_base, fare_per_km, min_saving_amount)
select 'IN', 'India', 'IN', 'INR', 'Asia/Kolkata',
       extensions.st_geogfromtext('SRID=4326;POLYGON((68 6, 97.5 6, 97.5 37.5, 68 37.5, 68 6))'),
       s.fare_base, s.fare_per_km, s.min_saving_rupees
from public.matching_settings s
where s.id = 1;

-- Airports: OurAirports (davidmegginson.github.io/ourairports-data), India,
-- scheduled service, with an IATA code. Downloaded 2026-10-30.
insert into public.airports (region_id, iata, icao, name, city, location)
select r.id, v.iata, v.icao, v.name, v.city,
       extensions.st_setsrid(extensions.st_makepoint(v.lng::float8, v.lat::float8), 4326)::extensions.geography
from public.regions r,
(values
  ('AGR', 'VIAG', 'Agra Airport / Agra Air Force Station', 'Agra', 27.157975, 77.961025),
  ('AGX', 'VOAT', 'Agatti Airport', 'Agatti', 10.823700, 72.176003),
  ('AHA', 'VEAP', 'Maa Mahamaya Airport', 'Ambikapur', 22.987530, 83.196120),
  ('AIP', 'VIAX', 'Adampur Airport', 'Adampur', 31.433800, 75.758797),
  ('AJL', 'VELP', 'Lengpui Airport', 'Aizawl (Lengpui)', 23.840599, 92.619698),
  ('AMD', 'VAAH', 'Sardar Vallabh Patel International Airport', 'Ahmedabad', 23.077200, 72.634697),
  ('ATQ', 'VIAR', 'Sri Guru Ram Das Ji International Airport', 'Amritsar', 31.709600, 74.797302),
  ('AVR', 'VAAM', 'Amravati  Airport', 'Amravati', 20.814608, 77.717765),
  ('AYJ', 'VEAY', 'Maharshi Valmiki International Airport', 'Faizabad', 26.747736, 82.163664),
  ('BBI', 'VEBS', 'Biju Patnaik International Airport', 'Bhubaneswar', 20.251021, 85.814747),
  ('BDQ', 'VABO', 'Vadodara International Airport', 'Vadodara', 22.336201, 73.226303),
  ('BEK', 'VIBY', 'Bareilly Air Force Station', 'Bareilly', 28.422100, 79.450798),
  ('BHJ', 'VABJ', 'Bhuj Airport', 'Bhuj', 23.287800, 69.670197),
  ('BHO', 'VABP', 'Raja Bhoj International Airport', 'Bhopal', 23.287500, 77.337402),
  ('BHU', 'VABV', 'Bhavnagar Airport', 'Bhavnagar', 21.752199, 72.185204),
  ('BLR', 'VOBL', 'Kempegowda International Airport Bengaluru', 'Bengaluru', 13.197900, 77.706299),
  ('BOM', 'VABB', 'Chhatrapati Shivaji Maharaj International Airport', 'Mumbai', 19.088699, 72.867897),
  ('CCJ', 'VOCL', 'Calicut International Airport', 'Calicut', 11.135996, 75.955152),
  ('CCU', 'VECC', 'Netaji Subhash Chandra Bose International Airport', 'Kolkata', 22.654012, 88.447650),
  ('CDP', 'VOCP', 'Kadapa Airport', 'Kadapa', 14.513154, 78.769183),
  ('CJB', 'VOCB', 'Coimbatore International Airport', 'Coimbatore', 11.030000, 77.043404),
  ('CNN', 'VOKN', 'Kannur International Airport', 'Kannur', 11.916343, 75.544979),
  ('COK', 'VOCI', 'Cochin International Airport', 'Kochi', 10.151047, 76.400838),
  ('DBR', 'VEDH', 'Darbhanga Airport', 'Darbhanga', 26.192801, 85.916901),
  ('DED', 'VIDN', 'Dehradun Jolly Grant Airport', 'Dehradun (Jauligrant)', 30.189243, 78.176651),
  ('DEL', 'VIDP', 'Indira Gandhi International Airport', 'New Delhi', 28.555630, 77.095190),
  ('DGH', 'VEDO', 'Deoghar Airport', 'Deoghar', 24.446842, 86.704955),
  ('DHM', 'VIGG', 'Kangra Airport', 'Kangra', 32.164902, 76.263018),
  ('DIB', 'VEMN', 'Dibrugarh Airport', 'Dibrugarh', 27.483900, 95.016899),
  ('DIU', 'VADU', 'Diu Airport', 'Diu', 20.714185, 70.921855),
  ('DMU', 'VEMR', 'Dimapur Airport', 'Dimapur', 25.883900, 93.771103),
  ('DXN', 'VIND', 'Noida International Airport', 'Gautam Buddha Nagar', 28.179868, 77.611843),
  ('GAU', 'VEGT', 'Lokpriya Gopinath Bordoloi International Airport', 'Guwahati', 26.106654, 91.585226),
  ('GAY', 'VEGY', 'Gaya Airport', 'Gaya', 24.744301, 84.951202),
  ('GBI', 'VOGB', 'Kalaburagi Airport', 'Kalaburagi', 17.308154, 76.965246),
  ('GDB', 'VAGD', 'Gondia Airport', 'Gondia', 21.526817, 80.290347),
  ('GOI', 'VOGO', 'Goa Dabolim International Airport', 'Vasco da Gama', 15.380062, 73.833328),
  ('GOP', 'VEGK', 'Gorakhpur Airport', 'Gorakhpur', 26.739700, 83.449699),
  ('GOX', 'VOGA', 'Manohar International Airport', 'Mopa', 15.744257, 73.860625),
  ('GWL', 'VIGR', 'Gwalior Airport', 'Gwalior', 26.293301, 78.227798),
  ('HBX', 'VOHB', 'Hubballi Airport', 'Hubballi', 15.361084, 75.082096),
  ('HDO', 'VIDX', 'Hindon Airport / Hindon Air Force Station', 'Ghaziabad', 28.707701, 77.358902),
  ('HGI', 'VEHO', 'Itanagar Donyi Polo Hollongi Airport', 'Hollongi', 26.966830, 93.638792),
  ('HJR', 'VEKO', 'Khajuraho Airport', 'Khajuraho', 24.817200, 79.918602),
  ('HSR', 'VAHS', 'Rajkot International Airport', 'Rajkot', 22.378824, 71.039391),
  ('HSS', 'VIHR', 'Maharaja Agrasen International Airport', 'Hisar', 29.186065, 75.741420),
  ('HWR', 'VIHX', 'Halwara International Airport', 'Halwara', 30.748501, 75.629799),
  ('HYD', 'VOHS', 'Rajiv Gandhi International Airport', 'Hyderabad', 17.231318, 78.429855),
  ('IDR', 'VAID', 'Devi Ahilya Bai Holkar International Airport', 'Indore', 22.721404, 75.800510),
  ('IMF', 'VEIM', 'Bir Tikendrajit International Airport', 'Imphal', 24.760000, 93.896698),
  ('ISK', 'VAOZ', 'Nashik International Airport', 'Nashik', 20.119101, 73.912903),
  ('IXA', 'VEAT', 'Agartala - Maharaja Bir Bikram Airport', 'Agartala', 23.886999, 91.240402),
  ('IXB', 'VEBD', 'Bagdogra Airport', 'Siliguri', 26.681200, 88.328598),
  ('IXC', 'VICG', 'Shaheed Bhagat Singh International Airport', 'Chandigarh', 30.673500, 76.788498),
  ('IXD', 'VEAB', 'Prayagraj Airport', 'Allahabad', 25.440100, 81.733902),
  ('IXE', 'VOML', 'Mangaluru International Airport', 'Mangaluru', 12.954710, 74.886812),
  ('IXG', 'VOBM', 'Belagavi Airport', 'Belgaum', 15.859300, 74.618301),
  ('IXI', 'VELR', 'Lilabari North Lakhimpur Airport', 'Lilabari', 27.295682, 94.097266),
  ('IXJ', 'VIJU', 'Jammu Airport', 'Jammu', 32.688849, 74.838152),
  ('IXK', 'VAKS', 'Keshod Airport', 'Keshod', 21.317101, 70.270401),
  ('IXL', 'VILH', 'Leh Kushok Bakula Rimpochee Airport', 'Leh', 34.135899, 77.546501),
  ('IXM', 'VOMD', 'Madurai Airport', 'Madurai', 9.834510, 78.093399),
  ('IXP', 'VIPK', 'Pathankot Airport', 'Pathankot', 32.233611, 75.634444),
  ('IXR', 'VERC', 'Birsa Munda Airport', 'Ranchi', 23.314301, 85.321701),
  ('IXS', 'VEKU', 'Silchar Airport', 'Silchar', 24.912901, 92.978699),
  ('IXU', 'VAAU', 'Aurangabad Airport', 'Aurangabad', 19.862875, 75.396312),
  ('IXY', 'VAKE', 'Kandla Airport', 'Kandla', 23.112700, 70.100304),
  ('IXZ', 'VOPB', 'Veer Savarkar International Airport / INS Utkrosh', 'Port Blair', 11.640194, 92.729020),
  ('JAI', 'VIJP', 'Jaipur International Airport', 'Jaipur', 26.824200, 75.812202),
  ('JDH', 'VIJO', 'Jodhpur Airport', 'Jodhpur', 26.251101, 73.048897),
  ('JGA', 'VAJM', 'Jamnagar Airport', 'Jamnagar', 22.465500, 70.012604),
  ('JGB', 'VEJR', 'Jagdalpur Airport', 'Jagdalpur', 19.074301, 82.036797),
  ('JLG', 'VAJL', 'Jalgaon Airport', 'Jalgaon', 20.962678, 75.627492),
  ('JLR', 'VAJB', 'Jabalpur Airport', 'Jabalpur', 23.177799, 80.052002),
  ('JRG', 'VEJH', 'Jharsuguda Airport', '', 21.913500, 84.050400),
  ('JRH', 'VEJT', 'Jorhat Airport', 'Jorhat', 26.730456, 94.175416),
  ('JSA', 'VIJR', 'Jaisalmer Airport', '', 26.888700, 70.864998),
  ('KJB', 'VOKU', 'Kurnool Airport', 'Orvakal', 15.716288, 78.169230),
  ('KLH', 'VAKP', 'Kolhapur Airport', 'Kolhapur', 16.664700, 74.289398),
  ('KNU', 'VECX', 'Kanpur Airport', 'Kanpur', 26.404301, 80.410103),
  ('KQH', 'VIKG', 'Kishangarh Airport Ajmer', 'Ajmer (Kishangarh)', 26.591007, 74.812956),
  ('KUU', 'VIBR', 'Kullu Manali Airport', 'Bhuntar', 31.876699, 77.154404),
  ('LKO', 'VILK', 'Chaudhary Charan Singh International Airport', 'Lucknow', 26.760599, 80.889297),
  ('LTU', 'VALT', 'Murod Kond Airport', 'Latur', 18.411501, 76.464699),
  ('MAA', 'VOMM', 'Chennai International Airport', 'Chennai', 12.990005, 80.169296),
  ('MYQ', 'VOMY', 'Mysore Airport', 'Mysore', 12.229751, 76.653683),
  ('MZS', 'VIMB', 'Moradabad Airport', 'Moradabad', 28.817460, 78.921870),
  ('NAG', 'VANP', 'Dr. Babasaheb Ambedkar International Airport', 'Nagpur', 21.092199, 79.047203),
  ('NDC', 'VAND', 'Nanded Airport', 'Nanded', 19.183300, 77.316704),
  ('NMI', 'VANM', 'Navi Mumbai International Airport', 'Navi Mumbai', 18.984597, 73.065253),
  ('PAB', 'VEBU', 'Bilaspur Airport', 'Bilaspur', 21.988400, 82.111000),
  ('PAT', 'VEPT', 'Jay Prakash Narayan Airport', 'Patna', 25.591299, 85.087997),
  ('PBD', 'VAPR', 'Porbandar Airport', 'Porbandar', 21.649524, 69.656405),
  ('PGH', 'VIPT', 'Pantnagar Airport', 'Pantnagar', 29.033400, 79.473701),
  ('PNQ', 'VAPO', 'Pune International Airport', 'Pune', 18.582100, 73.919701),
  ('PNY', 'VOPC', 'Pondicherry Airport', 'Puducherry (Pondicherry)', 11.968000, 79.812000),
  ('RDP', 'VEDG', 'Kazi Nazrul Islam Airport', 'Durgapur', 23.622500, 87.243000),
  ('REW', 'VERW', 'Rewa Airport, Chorhata, REWA', 'Rewa', 24.503401, 81.220299),
  ('RJA', 'VORY', 'Rajahmundry Airport', 'Madhurapudi', 17.105799, 81.813204),
  ('RPR', 'VERP', 'Swami Vivekananda Airport', 'Raipur', 21.180401, 81.738800),
  ('SAG', 'VASD', 'Shirdi International Airport', 'Kakadi', 19.689211, 74.373655),
  ('SDW', 'VOSR', 'Sindhudurg Airport', 'Chipi', 16.002552, 73.529846),
  ('SHL', 'VEBI', 'Shillong Airport', 'Shillong', 25.703600, 91.978699),
  ('STV', 'VASU', 'Surat International Airport', 'Surat', 21.115531, 72.743251),
  ('SXR', 'VISR', 'Srinagar International Airport', 'Srinagar', 33.987099, 74.774200),
  ('TCR', 'VOTK', 'Tuticorin Airport', 'Vagaikulam', 8.724241, 78.025803),
  ('TEZ', 'VETZ', 'Tezpur Airport', '', 26.709101, 92.784698),
  ('TIR', 'VOTP', 'Tirupati International Airport', 'Tirupati', 13.631988, 79.539869),
  ('TRV', 'VOTV', 'Thiruvananthapuram International Airport', 'Thiruvananthapuram', 8.481889, 76.920029),
  ('TRZ', 'VOTR', 'Tiruchirappalli International Airport', 'Tiruchirappalli', 10.762915, 78.717741),
  ('UDR', 'VAUD', 'Maharana Pratap Airport', 'Udaipur', 24.617701, 73.896103),
  ('UKE', 'VEUK', 'Utkela Airport', 'Bhawanipatna', 20.097778, 83.183333),
  ('VGA', 'VOBZ', 'Vijayawada International Airport', 'Vijayawada', 16.530011, 80.804888),
  ('VNS', 'VEBN', 'Lal Bahadur Shastri International Airport', 'Varanasi', 25.452171, 82.862549),
  ('VSV', 'VISV', 'Shravasti Airport', 'Shravasti', 27.499732, 82.032927),
  ('VTZ', 'VOVI', 'Alluri Sitarama Raju International Airport (Vizag)', 'Visakhapatnam', 17.971512, 83.503617)
) as v (iata, icao, name, city, lat, lng)
where r.code = 'IN';

-- Terminals. Multi-terminal airports (AMD BLR BOM COK DEL JAI MAA TRV) use
-- Ola Maps terminal locations; others use Ola's airport result.
insert into public.terminals (airport_id, code, name, location, meeting_point, sort)
select a.id, v.code, v.name,
       extensions.st_setsrid(extensions.st_makepoint(v.lng::float8, v.lat::float8), 4326)::extensions.geography,
       v.meeting_point, v.sort
from (values
  ('AGR', 'MAIN', 'Main terminal', 27.15258, 77.961727, 'Arrivals – app cab pickup area', 0),
  ('AGX', 'MAIN', 'Main terminal', 10.828082, 72.179295, 'Arrivals – app cab pickup area', 0),
  ('AHA', 'MAIN', 'Main terminal', 22.986498, 83.199722, 'Arrivals – app cab pickup area', 0),
  ('AIP', 'MAIN', 'Main terminal', 31.42336, 75.762155, 'Arrivals – app cab pickup area', 0),
  ('AJL', 'MAIN', 'Main terminal', 23.838947, 92.624415, 'Arrivals – app cab pickup area', 0),
  ('AMD', 'T1', 'Terminal 1', 23.072439, 72.620237, 'Terminal 1 Arrivals – app cab pickup area', 0),
  ('AMD', 'T2', 'Terminal 2', 23.074568, 72.623811, 'Terminal 2 Arrivals – app cab pickup area', 1),
  ('ATQ', 'MAIN', 'Main terminal', 31.705533, 74.806833, 'Arrivals – app cab pickup area', 0),
  ('AVR', 'MAIN', 'Main terminal', 20.815482, 77.716521, 'Arrivals – app cab pickup area', 0),
  ('AYJ', 'MAIN', 'Main terminal', 26.748041, 82.15074, 'Arrivals – app cab pickup area', 0),
  ('BBI', 'MAIN', 'Main terminal', 20.254438, 85.816135, 'Arrivals – app cab pickup area', 0),
  ('BDQ', 'MAIN', 'Main terminal', 22.332695, 73.21716, 'Arrivals – app cab pickup area', 0),
  ('BEK', 'MAIN', 'Main terminal', 28.424845, 79.465738, 'Arrivals – app cab pickup area', 0),
  ('BHJ', 'MAIN', 'Main terminal', 23.275531, 69.663896, 'Arrivals – app cab pickup area', 0),
  ('BHO', 'MAIN', 'Main terminal', 23.29094, 77.335547, 'Arrivals – app cab pickup area', 0),
  ('BHU', 'MAIN', 'Main terminal', 21.753755, 72.183298, 'Arrivals – app cab pickup area', 0),
  ('BLR', 'T1', 'Terminal 1', 13.200663, 77.709701, 'Terminal 1 Arrivals – app cab pickup area', 0),
  ('BLR', 'T2', 'Terminal 2', 13.19882, 77.717143, 'Terminal 2 Arrivals – app cab pickup area', 1),
  ('BOM', 'T1', 'Terminal 1', 19.093143, 72.856527, 'Terminal 1 Arrivals – app cab pickup area', 0),
  ('BOM', 'T2', 'Terminal 2', 19.099793, 72.874794, 'Terminal 2 Arrivals – app cab pickup area', 1),
  ('CCJ', 'MAIN', 'Main terminal', 11.139585, 75.951372, 'Arrivals – app cab pickup area', 0),
  ('CCU', 'MAIN', 'Main terminal', 22.642591, 88.439306, 'Arrivals – app cab pickup area', 0),
  ('CDP', 'MAIN', 'Main terminal', 14.518408, 78.767959, 'Arrivals – app cab pickup area', 0),
  ('CJB', 'MAIN', 'Main terminal', 11.030782, 77.039927, 'Arrivals – app cab pickup area', 0),
  ('CNN', 'MAIN', 'Main terminal', 11.914414, 75.548856, 'Arrivals – app cab pickup area', 0),
  ('COK', 'T1', 'Terminal 1', 10.155337, 76.390252, 'Terminal 1 Arrivals – app cab pickup area', 0),
  ('COK', 'T3', 'Terminal 3', 10.157194, 76.393427, 'Terminal 3 Arrivals – app cab pickup area', 1),
  ('DBR', 'MAIN', 'Main terminal', 26.1882, 85.9189, 'Arrivals – app cab pickup area', 0),
  ('DED', 'MAIN', 'Main terminal', 30.195136, 78.19207, 'Arrivals – app cab pickup area', 0),
  ('DEL', 'T1', 'Terminal 1', 28.562642, 77.119772, 'Terminal 1 Arrivals – app cab pickup area', 0),
  ('DEL', 'T2', 'Terminal 2', 28.558265, 77.086917, 'Terminal 2 Arrivals – app cab pickup area', 1),
  ('DEL', 'T3', 'Terminal 3', 28.555393, 77.085083, 'Terminal 3 Arrivals – app cab pickup area', 2),
  ('DGH', 'MAIN', 'Main terminal', 24.4851, 86.6947, 'Arrivals – app cab pickup area', 0),
  ('DHM', 'MAIN', 'Main terminal', 32.164971, 76.259925, 'Arrivals – app cab pickup area', 0),
  ('DIB', 'MAIN', 'Main terminal', 27.483947, 95.022982, 'Arrivals – app cab pickup area', 0),
  ('DIU', 'MAIN', 'Main terminal', 20.713373, 70.924979, 'Arrivals – app cab pickup area', 0),
  ('DMU', 'MAIN', 'Main terminal', 25.880043, 93.773106, 'Arrivals – app cab pickup area', 0),
  ('DXN', 'MAIN', 'Main terminal', 28.175491, 77.5988, 'Arrivals – app cab pickup area', 0),
  ('GAU', 'MAIN', 'Main terminal', 26.106478, 91.58603, 'Arrivals – app cab pickup area', 0),
  ('GAY', 'MAIN', 'Main terminal', 24.748829, 84.943817, 'Arrivals – app cab pickup area', 0),
  ('GBI', 'MAIN', 'Main terminal', 17.310261, 76.953437, 'Arrivals – app cab pickup area', 0),
  ('GDB', 'MAIN', 'Main terminal', 21.52203, 80.290517, 'Arrivals – app cab pickup area', 0),
  ('GOI', 'MAIN', 'Main terminal', 15.384982, 73.83741, 'Arrivals – app cab pickup area', 0),
  ('GOP', 'MAIN', 'Main terminal', 26.746533, 83.442952, 'Arrivals – app cab pickup area', 0),
  ('GOX', 'MAIN', 'Main terminal', 15.7318, 73.8681, 'Arrivals – app cab pickup area', 0),
  ('GWL', 'MAIN', 'Main terminal', 26.2855, 78.217, 'Arrivals – app cab pickup area', 0),
  ('HBX', 'MAIN', 'Main terminal', 15.357097, 75.08458, 'Arrivals – app cab pickup area', 0),
  ('HDO', 'MAIN', 'Main terminal', 28.705194, 77.342197, 'Arrivals – app cab pickup area', 0),
  ('HGI', 'MAIN', 'Main terminal', 26.971902, 93.642458, 'Arrivals – app cab pickup area', 0),
  ('HJR', 'MAIN', 'Main terminal', 24.81049, 79.912592, 'Arrivals – app cab pickup area', 0),
  ('HSR', 'MAIN', 'Main terminal', 22.380097, 71.033207, 'Arrivals – app cab pickup area', 0),
  ('HSS', 'MAIN', 'Main terminal', 29.177561, 75.754826, 'Arrivals – app cab pickup area', 0),
  ('HWR', 'MAIN', 'Main terminal', 30.753896, 75.634323, 'Arrivals – app cab pickup area', 0),
  ('HYD', 'MAIN', 'Main terminal', 17.2367, 78.4291, 'Arrivals – app cab pickup area', 0),
  ('IDR', 'MAIN', 'Main terminal', 22.728007, 75.804293, 'Arrivals – app cab pickup area', 0),
  ('IMF', 'MAIN', 'Main terminal', 24.764647, 93.897279, 'Arrivals – app cab pickup area', 0),
  ('ISK', 'MAIN', 'Main terminal', 20.113029, 73.893952, 'Arrivals – app cab pickup area', 0),
  ('IXA', 'MAIN', 'Main terminal', 23.892557, 91.244156, 'Arrivals – app cab pickup area', 0),
  ('IXB', 'MAIN', 'Main terminal', 26.685027, 88.3254, 'Arrivals – app cab pickup area', 0),
  ('IXC', 'MAIN', 'Main terminal', 30.6674, 76.7856, 'Arrivals – app cab pickup area', 0),
  ('IXD', 'MAIN', 'Main terminal', 25.43065, 81.74087, 'Arrivals – app cab pickup area', 0),
  ('IXE', 'MAIN', 'Main terminal', 12.950214, 74.872379, 'Arrivals – app cab pickup area', 0),
  ('IXG', 'MAIN', 'Main terminal', 15.863015, 74.611293, 'Arrivals – app cab pickup area', 0),
  ('IXI', 'MAIN', 'Main terminal', 27.287539, 94.092912, 'Arrivals – app cab pickup area', 0),
  ('IXJ', 'MAIN', 'Main terminal', 32.681061, 74.842285, 'Arrivals – app cab pickup area', 0),
  ('IXK', 'MAIN', 'Main terminal', 21.318038, 70.267085, 'Arrivals – app cab pickup area', 0),
  ('IXL', 'MAIN', 'Main terminal', 34.14259, 77.55562, 'Arrivals – app cab pickup area', 0),
  ('IXM', 'MAIN', 'Main terminal', 9.838629, 78.089638, 'Arrivals – app cab pickup area', 0),
  ('IXP', 'MAIN', 'Main terminal', 32.223701, 75.636403, 'Arrivals – app cab pickup area', 0),
  ('IXR', 'MAIN', 'Main terminal', 23.317376, 85.325423, 'Arrivals – app cab pickup area', 0),
  ('IXS', 'MAIN', 'Main terminal', 24.915978, 92.979355, 'Arrivals – app cab pickup area', 0),
  ('IXU', 'MAIN', 'Main terminal', 19.866267, 75.397265, 'Arrivals – app cab pickup area', 0),
  ('IXY', 'MAIN', 'Main terminal', 23.111851, 70.104314, 'Arrivals – app cab pickup area', 0),
  ('IXZ', 'MAIN', 'Main terminal', 11.6519, 92.7335, 'Arrivals – app cab pickup area', 0),
  ('JAI', 'T1', 'Terminal 1', 26.821247, 75.801006, 'Terminal 1 Arrivals – app cab pickup area', 0),
  ('JAI', 'T2', 'Terminal 2', 26.827987, 75.805881, 'Terminal 2 Arrivals – app cab pickup area', 1),
  ('JDH', 'MAIN', 'Main terminal', 26.26402, 73.050553, 'Arrivals – app cab pickup area', 0),
  ('JGA', 'MAIN', 'Main terminal', 22.460709, 70.01585, 'Arrivals – app cab pickup area', 0),
  ('JGB', 'MAIN', 'Main terminal', 19.076226, 82.03663, 'Arrivals – app cab pickup area', 0),
  ('JLG', 'MAIN', 'Main terminal', 20.961379, 75.619141, 'Arrivals – app cab pickup area', 0),
  ('JLR', 'MAIN', 'Main terminal', 23.184725, 80.055832, 'Arrivals – app cab pickup area', 0),
  ('JRG', 'MAIN', 'Main terminal', 21.916174, 84.046291, 'Arrivals – app cab pickup area', 0),
  ('JRH', 'MAIN', 'Main terminal', 26.734661, 94.184682, 'Arrivals – app cab pickup area', 0),
  ('JSA', 'MAIN', 'Main terminal', 26.870585, 70.855811, 'Arrivals – app cab pickup area', 0),
  ('KJB', 'MAIN', 'Main terminal', 15.7133, 78.1614, 'Arrivals – app cab pickup area', 0),
  ('KLH', 'MAIN', 'Main terminal', 16.6674, 74.2839, 'Arrivals – app cab pickup area', 0),
  ('KNU', 'MAIN', 'Main terminal', 26.3996, 80.427, 'Arrivals – app cab pickup area', 0),
  ('KQH', 'MAIN', 'Main terminal', 26.5901, 74.816377, 'Arrivals – app cab pickup area', 0),
  ('KUU', 'MAIN', 'Main terminal', 31.877029, 77.15198, 'Arrivals – app cab pickup area', 0),
  ('LKO', 'MAIN', 'Main terminal', 26.7656, 80.8795, 'Arrivals – app cab pickup area', 0),
  ('LTU', 'MAIN', 'Main terminal', 18.40969, 76.4661, 'Arrivals – app cab pickup area', 0),
  ('MAA', 'T1', 'Terminal 1', 12.982782, 80.164181, 'Terminal 1 Arrivals – app cab pickup area', 0),
  ('MAA', 'T2', 'Terminal 2', 12.981595, 80.159366, 'Terminal 2 Arrivals – app cab pickup area', 1),
  ('MAA', 'T4', 'Terminal 4', 12.98123, 80.160188, 'Terminal 4 Arrivals – app cab pickup area', 2),
  ('MYQ', 'MAIN', 'Main terminal', 12.227766, 76.658134, 'Arrivals – app cab pickup area', 0),
  ('MZS', 'MAIN', 'Main terminal', 28.817572, 78.922066, 'Arrivals – app cab pickup area', 0),
  ('NAG', 'MAIN', 'Main terminal', 21.091058, 79.054841, 'Arrivals – app cab pickup area', 0),
  ('NDC', 'MAIN', 'Main terminal', 19.183392, 77.335191, 'Arrivals – app cab pickup area', 0),
  ('NMI', 'MAIN', 'Main terminal', 18.98844178, 73.0540828, 'Arrivals – app cab pickup area', 0),
  ('PAB', 'MAIN', 'Main terminal', 21.994647, 82.114776, 'Arrivals – app cab pickup area', 0),
  ('PAT', 'MAIN', 'Main terminal', 25.596, 85.0909, 'Arrivals – app cab pickup area', 0),
  ('PBD', 'MAIN', 'Main terminal', 21.647757, 69.66096, 'Arrivals – app cab pickup area', 0),
  ('PGH', 'MAIN', 'Main terminal', 29.031322, 79.472315, 'Arrivals – app cab pickup area', 0),
  ('PNQ', 'MAIN', 'Main terminal', 18.579093, 73.910604, 'Arrivals – app cab pickup area', 0),
  ('PNY', 'MAIN', 'Main terminal', 11.965595, 79.814885, 'Arrivals – app cab pickup area', 0),
  ('RDP', 'MAIN', 'Main terminal', 23.617922, 87.240172, 'Arrivals – app cab pickup area', 0),
  ('REW', 'MAIN', 'Main terminal', 24.501168, 81.220635, 'Arrivals – app cab pickup area', 0),
  ('RJA', 'MAIN', 'Main terminal', 17.107161, 81.822407, 'Arrivals – app cab pickup area', 0),
  ('RPR', 'MAIN', 'Main terminal', 21.18598, 81.740266, 'Arrivals – app cab pickup area', 0),
  ('SAG', 'MAIN', 'Main terminal', 19.693982, 74.394502, 'Arrivals – app cab pickup area', 0),
  ('SDW', 'MAIN', 'Main terminal', 15.998898, 73.534645, 'Arrivals – app cab pickup area', 0),
  ('SHL', 'MAIN', 'Main terminal', 25.706146, 91.975133, 'Arrivals – app cab pickup area', 0),
  ('STV', 'MAIN', 'Main terminal', 21.120491, 72.742538, 'Arrivals – app cab pickup area', 0),
  ('SXR', 'MAIN', 'Main terminal', 34.00215, 74.762373, 'Arrivals – app cab pickup area', 0),
  ('TCR', 'MAIN', 'Main terminal', 8.7284, 78.0244, 'Arrivals – app cab pickup area', 0),
  ('TEZ', 'MAIN', 'Main terminal', 26.698864, 92.76856, 'Arrivals – app cab pickup area', 0),
  ('TIR', 'MAIN', 'Main terminal', 13.637221, 79.547446, 'Arrivals – app cab pickup area', 0),
  ('TRV', 'T1', 'Terminal 1', 8.476764, 76.918908, 'Terminal 1 Arrivals – app cab pickup area', 0),
  ('TRV', 'T2', 'Terminal 2', 8.487342, 76.92195, 'Terminal 2 Arrivals – app cab pickup area', 1),
  ('TRZ', 'MAIN', 'Main terminal', 10.759724, 78.713942, 'Arrivals – app cab pickup area', 0),
  ('UDR', 'MAIN', 'Main terminal', 24.6206, 73.8873, 'Arrivals – app cab pickup area', 0),
  ('UKE', 'MAIN', 'Main terminal', 20.097734, 83.183365, 'Arrivals – app cab pickup area', 0),
  ('VGA', 'MAIN', 'Main terminal', 16.52395, 80.791193, 'Arrivals – app cab pickup area', 0),
  ('VNS', 'MAIN', 'Main terminal', 25.448792, 82.856728, 'Arrivals – app cab pickup area', 0),
  ('VSV', 'MAIN', 'Main terminal', 27.502109, 82.026369, 'Arrivals – app cab pickup area', 0),
  ('VTZ', 'MAIN', 'Main terminal', 17.977732333, 83.506377709, 'Arrivals – app cab pickup area', 0)
) as v (iata, code, name, lat, lng, meeting_point, sort)
join public.airports a on a.iata = v.iata;

-- Keep BLR's meeting points as currently tuned
update public.terminals t
set meeting_point = case t.code when 'T1' then s.meeting_point_t1 else s.meeting_point_t2 end
from public.airports a, public.matching_settings s
where a.id = t.airport_id and a.iata = 'BLR' and t.code in ('T1', 'T2') and s.id = 1;


-- ---------------------------------------------------------------------
-- 3. Trips and matches: new columns
-- ---------------------------------------------------------------------
alter table public.trips
  add column region_id       uuid references public.regions (id),
  add column terminal_id     uuid references public.terminals (id),
  add column place_provider  text not null default 'ola',   -- which maps service the place ids come from
  add column pickup_place_id text,
  add column drop_place_id   text;

-- terminal is now just the terminal's code, filled by prepare_trip()
alter table public.trips drop constraint trips_terminal_check;
alter table public.trips alter column terminal drop default;
-- pickup is filled by prepare_trip() from the terminal
alter table public.trips alter column pickup_location drop default;

drop index if exists public.trips_window_idx;
create index trips_window_idx on public.trips (status, terminal_id, ready_from, ready_until);
create index trips_region_idx on public.trips (region_id);

alter table public.matches add column currency text check (currency ~ '^[A-Z]{3}$');


-- ---------------------------------------------------------------------
-- 4. Functions that used terminal text or the fare settings
-- ---------------------------------------------------------------------

-- Every trip insert/update: set the pickup from the terminal, check distance,
-- compute the ready window
create or replace function public.prepare_trip()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s          public.matching_settings;
  v_terminal public.terminals;
  v_airport  public.airports;
  v_straight numeric;
  v_exit     int;
begin
  select * into s from public.matching_settings where id = 1;

  -- Current app sends only terminal 'T1' / 'T2' (Bengaluru). Remove once it sends terminal_id.
  if new.terminal_id is null and new.terminal in ('T1', 'T2') then
    select t.id into new.terminal_id
    from public.terminals t join public.airports a on a.id = t.airport_id
    where a.iata = 'BLR' and t.code = new.terminal;
  end if;

  -- Pickup is an airport terminal (address pickups come later)
  if new.terminal_id is null then
    raise exception 'Please pick your airport terminal.';
  end if;
  select * into v_terminal from public.terminals where id = new.terminal_id;
  select * into v_airport  from public.airports  where id = v_terminal.airport_id;

  if tg_op = 'INSERT' and (not v_terminal.active or not v_airport.active
      or not exists (select 1 from public.regions where id = v_airport.region_id and active)) then
    raise exception 'SCab isn''t available at this airport yet.';
  end if;

  new.region_id       := v_airport.region_id;
  new.terminal        := v_terminal.code;
  new.pickup_label    := v_airport.name || case when v_terminal.code = 'MAIN' then '' else ', ' || v_terminal.name end;
  new.pickup_location := v_terminal.location;

  -- Drop coordinates (for Uber deep links / "Add stop")
  new.drop_lat := extensions.st_y(new.drop_location::extensions.geometry);
  new.drop_lng := extensions.st_x(new.drop_location::extensions.geometry);

  -- Keep the app's road distance only if believable; otherwise estimate it
  v_straight := (extensions.st_distance(new.pickup_location, new.drop_location) / 1000)::numeric;
  if new.distance_km is null or new.distance_km < v_straight or new.distance_km > v_straight * 2 then
    new.distance_km := round(v_straight * s.road_factor, 2);
  end if;

  -- Women-only trips: female accounts only
  if new.women_only and coalesce((select gender from public.profiles where id = new.user_id), '') <> 'female' then
    raise exception 'Only female accounts can create women-only trips.';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'open';
    new.stage  := 'scheduled';
    if new.mode = 'live' then
      new.checked_in_at := now();          -- live = already out
      new.landing_at    := null;
    else
      new.checked_in_at := null;
      if new.landing_at is null then
        raise exception 'Please enter your landing time.';
      end if;
      if new.landing_at > now() + interval '30 days' then
        raise exception 'You can schedule up to 30 days ahead.';
      end if;
    end if;
    new.auto_accept := coalesce(new.auto_accept, new.mode = 'live');
  end if;

  -- Ready window: when you're out → until your wait runs out
  if new.checked_in_at is not null then
    new.stage      := 'out';
    new.ready_from := new.checked_in_at;
  else
    v_exit := case when new.checked_bags then s.exit_minutes_checked else s.exit_minutes_cabin end
            + case when new.is_international then s.exit_minutes_international_extra else 0 end;
    new.ready_from := new.landing_at + make_interval(mins => v_exit);
  end if;
  new.ready_until := new.ready_from + make_interval(mins => new.wait_minutes);

  if tg_op = 'INSERT' then
    if new.ready_until <= now() then
      raise exception 'That time has already passed. If you are at the airport now, use "I''m at the airport now".';
    end if;
    if exists (select 1 from public.trips t
               where t.user_id = new.user_id and t.status in ('open', 'matched')
                 and t.ready_from < new.ready_until and new.ready_from < t.ready_until) then
      raise exception 'You already have a trip around this time.';
    end if;
  end if;

  return new;
end; $$;

-- Money and time estimates for a possible pair (SCAB_SPEC.md §4.3).
-- Fares come from the trips' region (matching only pairs trips in one region).
create or replace function public.pair_estimate(p_a public.trips, p_b public.trips)
returns table (solo_a numeric, solo_b numeric, shared_fare numeric,
               saving_percent numeric, min_saving numeric, extra_minutes numeric)
language sql stable security definer set search_path = '' as $$
  with s as (
    select r.fare_base, r.fare_per_km, ms.road_factor, ms.city_speed_kmph, ms.stop_minutes
    from public.matching_settings ms
    join public.regions r on r.id = p_a.region_id
    where ms.id = 1
  ),
  g as (   -- straight-line km
    select (extensions.st_distance(p_a.pickup_location, p_a.drop_location) / 1000)::numeric as sa,
           (extensions.st_distance(p_b.pickup_location, p_b.drop_location) / 1000)::numeric as sb,
           (extensions.st_distance(p_a.drop_location,   p_b.drop_location)   / 1000)::numeric as sab
  ),
  r as (   -- road km
    select s.*,
           coalesce(p_a.distance_km, g.sa * s.road_factor) as ra,
           coalesce(p_b.distance_km, g.sb * s.road_factor) as rb,
           -- detour = (pickup→nearer drop) + (nearer drop→farther drop) − (pickup→farther drop)
           greatest(0, least(g.sa, g.sb) + g.sab - greatest(g.sa, g.sb)) * s.road_factor as detour_km
    from s, g
  ),
  f as (
    select r.*,
           r.fare_base + r.fare_per_km * r.ra as fa,
           r.fare_base + r.fare_per_km * r.rb as fb,
           r.fare_base + r.fare_per_km * (greatest(r.ra, r.rb) + r.detour_km) as fs
    from r
  )
  select round(fa), round(fb), round(fs),
         round(100 * (1 - fs / (fa + fb)), 1),
         round(least(fa, fb) * (1 - fs / (fa + fb))),
         round(detour_km / city_speed_kmph * 60 + stop_minutes, 1)
  from f;
$$;

-- Create a match between two open trips at the same terminal (the rider going farther books)
create or replace function public.create_match(p_trip_a uuid, p_trip_b uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s       public.matching_settings;
  a       public.trips;
  b       public.trips;
  e       record;
  v_match uuid;
begin
  select * into s from public.matching_settings where id = 1;
  select * into a from public.trips where id = p_trip_a and status = 'open' for update;
  select * into b from public.trips where id = p_trip_b and status = 'open' for update;
  if a.id is null or b.id is null then raise exception 'Both trips must be open.'; end if;
  if a.user_id = b.user_id then raise exception 'Cannot match a rider with themselves.'; end if;
  if a.terminal_id is distinct from b.terminal_id then raise exception 'Trips must share a pickup.'; end if;
  if (a.women_only or b.women_only) and exists (
       select 1 from public.profiles where id in (a.user_id, b.user_id)
       and coalesce(gender, '') <> 'female') then
    raise exception 'Women-only trip can only be matched with a female account.';
  end if;

  select * into e from public.pair_estimate(a, b);

  insert into public.matches (meeting_point, currency, estimated_fare, saving_percent, extra_minutes,
                              booker_id, accept_deadline)
  values ((select meeting_point from public.terminals where id = a.terminal_id),
          (select currency from public.regions where id = a.region_id),
          e.shared_fare, e.saving_percent, e.extra_minutes,
          case when a.distance_km >= b.distance_km then a.user_id else b.user_id end,
          least(now() + make_interval(mins => s.accept_minutes), a.ready_until, b.ready_until))
  returning id into v_match;

  insert into public.match_members (match_id, trip_id, user_id, accepted, solo_estimate, estimated_share)
  values (v_match, a.id, a.user_id, case when a.auto_accept then true end, e.solo_a,
          round(e.shared_fare * e.solo_a / (e.solo_a + e.solo_b))),
         (v_match, b.id, b.user_id, case when b.auto_accept then true end, e.solo_b,
          round(e.shared_fare * e.solo_b / (e.solo_a + e.solo_b)));

  update public.trips set status = 'matched' where id in (a.id, b.id);

  -- Both auto-accept → confirmed straight away
  if coalesce(a.auto_accept, false) and coalesce(b.auto_accept, false) then
    update public.matches set status = 'confirmed' where id = v_match;
  end if;

  return v_match;
end; $$;

-- Find the best co-rider for one open trip (rules: SCAB_SPEC.md §4.1–4.2)
create or replace function public.try_match(p_trip_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s        public.matching_settings;
  v_region public.regions;
  me       public.trips;
  v_best   uuid;
begin
  select * into s from public.matching_settings where id = 1;
  select * into me from public.trips where id = p_trip_id and status = 'open' and ready_until > now();
  if me.id is null then return null; end if;
  select * into v_region from public.regions where id = me.region_id;

  select c.id into v_best
  from public.trips c
  join public.profiles pc on pc.id = c.user_id
  join public.profiles pm on pm.id = me.user_id
  cross join lateral public.pair_estimate(me, c) e
  where c.status = 'open'
    and c.id <> me.id
    and c.user_id <> me.user_id
    and c.ready_until > now()
    and c.terminal_id = me.terminal_id                                              -- rule 1
    and least(c.ready_until, me.ready_until) - greatest(c.ready_from, me.ready_from)
        >= make_interval(mins => s.min_overlap_minutes)                             -- rule 2
    and e.saving_percent >= s.min_saving_percent                                    -- rule 3
    and e.min_saving >= v_region.min_saving_amount                                  -- rule 3
    and e.extra_minutes <= s.max_extra_minutes                                      -- rule 4
    and (not (c.women_only or me.women_only)
         or (coalesce(pc.gender, '') = 'female' and coalesce(pm.gender, '') = 'female'))  -- rule 5
    and not public.pair_blocked(me.user_id, c.user_id)                              -- rule 6
  order by e.extra_minutes,
           least(c.ready_until, me.ready_until) - greatest(c.ready_from, me.ready_from) desc
  limit 1
  for update of c skip locked;

  if v_best is null then return null; end if;
  return public.create_match(me.id, v_best);
exception when others then
  -- e.g. the other trip was matched a split-second earlier: skip quietly
  raise warning 'try_match(%) skipped: %', p_trip_id, sqlerrm;
  return null;
end; $$;

-- Near-miss offer: someone compatible will be out shortly after my wait ends.
-- Returns at most one row; shows no name or address of the other rider.
create or replace function public.near_miss(p_trip_id uuid)
returns table (extra_wait_minutes int, other_ready_at timestamptz, drop_gap_km numeric,
               my_estimated_share numeric, my_solo_estimate numeric, saving_percent numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  s        public.matching_settings;
  v_region public.regions;
  me       public.trips;
begin
  select * into s from public.matching_settings where id = 1;
  select * into me from public.trips
  where id = p_trip_id and user_id = (select auth.uid()) and status = 'open' and ready_until > now();
  if me.id is null then return; end if;
  select * into v_region from public.regions where id = me.region_id;

  return query
  select x.needed, x.c_ready_from, x.gap_km, x.share, x.solo, x.pct
  from (
    select ceil(extract(epoch from (c.ready_from + make_interval(mins => s.min_overlap_minutes)
                                    - me.ready_until)) / 60)::int                      as needed,
           c.ready_from                                                                as c_ready_from,
           round((extensions.st_distance(me.drop_location, c.drop_location) / 1000)::numeric, 1) as gap_km,
           round(e.shared_fare * e.solo_a / (e.solo_a + e.solo_b))                     as share,
           e.solo_a                                                                    as solo,
           e.saving_percent                                                            as pct,
           e.extra_minutes                                                             as extra
    from public.trips c
    join public.profiles pc on pc.id = c.user_id
    join public.profiles pm on pm.id = me.user_id
    cross join lateral public.pair_estimate(me, c) e
    where c.status = 'open'
      and c.user_id <> me.user_id
      and c.terminal_id = me.terminal_id
      and c.ready_until > now()
      and c.ready_from >= me.ready_from
      and c.ready_from + make_interval(mins => s.min_overlap_minutes) > me.ready_until
      and e.saving_percent >= s.min_saving_percent
      and e.min_saving >= v_region.min_saving_amount
      and e.extra_minutes <= s.max_extra_minutes
      and (not (c.women_only or me.women_only)
           or (coalesce(pc.gender, '') = 'female' and coalesce(pm.gender, '') = 'female'))
      and not public.pair_blocked(me.user_id, c.user_id)
  ) x
  where x.needed between 1 and s.near_miss_max_minutes
    and me.wait_minutes + x.needed <= 60
  order by x.needed, x.extra
  limit 1;
end; $$;


-- ---------------------------------------------------------------------
-- 5. Move existing data over
-- ---------------------------------------------------------------------

-- Existing trips are all BLR; prepare_trip() fills region_id, pickup and terminal
update public.trips t
set terminal_id = te.id
from public.terminals te
join public.airports a on a.id = te.airport_id
where a.iata = 'BLR' and te.code = t.terminal and t.terminal_id is null;

alter table public.trips alter column region_id set not null;

update public.matches set currency = 'INR' where currency is null;
alter table public.matches alter column currency set not null;

-- Now on regions / terminals
alter table public.matching_settings
  drop column fare_base,
  drop column fare_per_km,
  drop column min_saving_rupees,
  drop column meeting_point_t1,
  drop column meeting_point_t2;
