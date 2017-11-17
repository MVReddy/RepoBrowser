#!/usr/bin/env python
from datetime import datetime, timedelta
import datetime
import re
import json

def meraki_events():
    year = datetime.datetime.today().year
    data = {}
    with open('meraki_events.log') as f:
        for line in f:
            cols = line.split()
            times = str(year),cols[0],cols[1],cols[2]
            e_time = '-'.join(times)
            data['Time'] = e_time
            data['Network'] = cols[6]
            if re.match('dhcp', cols[8]):
                types = cols[8], cols[9]
                e_type = ' '.join(types)
                data['Event type'] = e_type
                details = cols[10],cols[11],cols[12]
                e_details = ' '.join(details)
                data['Details'] = e_details
            elif re.match('vpn_type', cols[9]):
                data['Event type'] = cols[8]
                details = cols[9], cols[10]
                e_details = ' '.join(details)
                data['Details'] = e_details
            else:
                data['Event type'] = cols[8]
                data['Details'] = cols[9]
            e_data = [data]
            print "222222222222222", e_data
            try:
                with open('meraki_even_logs.json') as f:
                    datas = f.read()
                    print "111111111111111", datas
                    if datas:
                        original_data = json.loads(datas)
                        original_data.append(data)
                        # print "original_data", original_data
                        json_data = json.dumps(original_data)
                        # print "jsonnnnn", json_data
            except IOError:
                json_data = json.dumps(e_data)

            with open('meraki_even_logs.json', 'w') as f:
                json_data = json.dumps(e_data)
                f.write(json_data)
        return e_data
d=meraki_events()
# print d

# def files_append():
#     with open('meraki_events_original.log', 'w') as f:
#
#     pass
